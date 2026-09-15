#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <array>
#include <atomic>
#include <cstdio>
#include <iostream>
#include <thread>
#include <map>
#include <deque>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

static void emit(const juce::var& event) { std::cout << juce::JSON::toString(event, true) << std::endl; }
static void message(const juce::String& type, const juce::String& text) {
    auto* object = new juce::DynamicObject(); object->setProperty("type", type); object->setProperty("message", text); emit(juce::var(object));
}
class EditorWindow : public juce::DocumentWindow {
public:
    explicit EditorWindow(juce::AudioPluginInstance& plugin) : DocumentWindow(plugin.getName(), juce::Colour(0xff111a26), closeButton) {
        setUsingNativeTitleBar(true);
        auto* editor = plugin.createEditorIfNeeded();
        if (editor == nullptr) editor = new juce::GenericAudioProcessorEditor(plugin);
        setContentOwned(editor, true); setResizable(true, false); centreWithSize(getWidth(), getHeight()); setVisible(true);
    }
    void closeButtonPressed() override { setVisible(false); }
};
struct Slot {
    int id; bool bypass = false;
    std::unique_ptr<juce::AudioPluginInstance> plugin;
    std::unique_ptr<EditorWindow> editor;
};
class Host : public juce::AudioIODeviceCallback, public juce::AudioSource, private juce::Timer {
    static constexpr int capacity = 48000;
    juce::AbstractFifo fifo { capacity };
    std::array<std::array<float, capacity>, 2> samples {};
    juce::AudioDeviceManager devices;
    juce::AudioPluginFormatManager formats;
    juce::CriticalSection chainLock;
    std::vector<std::unique_ptr<Slot>> chain;
    juce::AudioBuffer<float> scratch;
    juce::ResamplingAudioSource resampler { this, false, 2 };
    juce::MidiBuffer midi;
    int blockSize = 512, nextId = 1;
    std::atomic<bool> deviceReady { false }, discardQueuedAudio { false };
    juce::String lastDeviceError;
    std::map<juce::String, juce::PluginDescription> descriptionsByPath;
    std::deque<std::pair<uint32_t, juce::String>> pendingCommands;
    bool loadingPlugin = false;
    std::shared_ptr<int> lifetime = std::make_shared<int>(0);
    void reportDeviceError(const juce::String& error) {
        if (error != lastDeviceError) { lastDeviceError = error; message("error", error); }
    }
    void timerCallback() override { followDefaultOutput(); }
    void followDefaultOutput() {
        auto* type = devices.getCurrentDeviceTypeObject();
        if (type == nullptr) return;
        type->scanForDevices();
        const auto names = type->getDeviceNames(false);
        const int index = type->getDefaultDeviceIndex(false);
        if (!juce::isPositiveAndBelow(index, names.size())) {
            devices.closeAudioDevice();
            reportDeviceError("音声出力が見つかりません。接続後に自動で再開します"); return;
        }
        auto* current = devices.getCurrentAudioDevice();
        if (current != nullptr && current->isPlaying() && deviceReady.load()
            && type->getIndexOfDevice(current, false) == index) return;
        // Device names are snapshots; compare the current endpoint index against
        // the freshly scanned default, including when both devices remain present.
        devices.closeAudioDevice();
        discardQueuedAudio = true;
        auto setup = devices.getAudioDeviceSetup();
        setup.inputDeviceName.clear(); setup.outputDeviceName = names[index];
        setup.useDefaultInputChannels = true; setup.useDefaultOutputChannels = true;
        setup.sampleRate = 0; setup.bufferSize = 0;
        const auto error = devices.setAudioDeviceSetup(setup, false);
        if (error.isNotEmpty()) { reportDeviceError(error); return; }
        lastDeviceError.clear();
        message("device", names[index]);
    }
    void finishPluginLoad() {
        loadingPlugin = false;
        message("plugin-finished", "");
        while (!loadingPlugin && !pendingCommands.empty()) {
            const auto next = pendingCommands.front(); pendingCommands.pop_front();
            command(next.first, next.second);
        }
    }
public:
    Host() { formats.addFormat(new juce::VST3PluginFormat()); }
    ~Host() { stopTimer(); lifetime.reset(); devices.removeAudioCallback(this); chain.clear(); devices.closeAudioDevice(); }
    bool testResampling() {
        // Offline regression: changing the physical sample rate must preserve pitch.
        // No output device is opened and no test tone reaches the speakers.
        for (const double rate : { 44100.0, 48000.0, 96000.0 }) {
            fifo.reset();
            resampler.setResamplingRatio(48000.0 / rate);
            resampler.prepareToPlay(512, rate);
            for (int packet = 0; packet < 4; ++packet) {
                std::vector<char> pcm(8192);
                for (int i = 0; i < 1024; ++i) {
                    const float value = 0.1f * std::sin(2.0 * juce::MathConstants<double>::pi * 1000.0 * (packet * 1024 + i) / 48000.0);
                    for (int ch = 0; ch < 2; ++ch) std::memcpy(pcm.data() + (i * 2 + ch) * sizeof(float), &value, sizeof(float));
                }
                push(pcm);
            }
            juce::AudioBuffer<float> output(2, 512);
            int crossings = 0; float previous = 0.0f, peak = 0.0f;
            for (int block = 0; block < 4; ++block) {
                resampler.getNextAudioBlock(juce::AudioSourceChannelInfo(&output, 0, 512));
                for (int i = 0; i < 512; ++i) {
                    const float value = output.getSample(0, i);
                    if (!std::isfinite(value)) return false;
                    if (previous <= 0.0f && value > 0.0f) ++crossings;
                    previous = value; peak = std::max(peak, std::abs(value));
                }
            }
            if (peak < 0.05f || peak > 0.2f || std::abs(crossings - 2048.0 * 1000.0 / rate) > 3.0) return false;
            message("resampling-test", juce::String(rate) + " Hz passed");
            resampler.releaseResources();
        }
        return true;
    }
    bool start() {
        auto error = devices.initialise(0, 2, nullptr, true);
        if (error.isNotEmpty()) reportDeviceError(error);
        devices.closeAudioDevice();
        scratch.setSize(2, blockSize);
        devices.addAudioCallback(this);
        followDefaultOutput();
        startTimer(750);
        message("ready", "48000 Hz stereo"); return true;
    }
    void push(const std::vector<char>& data) {
        if (data.size() != 8192) return;
        constexpr int frames = 1024;
        // Drop complete incoming packets on overrun; do not allow seconds of delayed playback.
        if (fifo.getFreeSpace() < frames || fifo.getNumReady() > 8192) return;
        int a, na, b, nb; fifo.prepareToWrite(frames, a, na, b, nb);
        int source = 0;
        auto copy = [&](int start, int count) {
            for (int i = 0; i < count; ++i) for (int ch = 0; ch < 2; ++ch) {
                float value; std::memcpy(&value, data.data() + sizeof(float) * source++, sizeof(float));
                samples[static_cast<size_t>(ch)][static_cast<size_t>(start + i)] = std::isfinite(value) ? value : 0.0f;
            }
        };
        copy(a, na); copy(b, nb); fifo.finishedWrite(na + nb);
    }
    void list() {
        juce::Array<juce::var> plugins;
        for (const auto& slot : chain) {
            auto* entry = new juce::DynamicObject(); entry->setProperty("id", slot->id); entry->setProperty("name", slot->plugin->getName()); entry->setProperty("bypass", slot->bypass); plugins.add(juce::var(entry));
        }
        auto* event = new juce::DynamicObject(); event->setProperty("type", "plugins"); event->setProperty("plugins", plugins); emit(juce::var(event));
    }
    void command(uint32_t type, const juce::String& payload) {
        if (loadingPlugin) {
            if (pendingCommands.size() < 64) pendingCommands.emplace_back(type, payload);
            else message("error", "Too many pending plugin operations");
            return;
        }
        if (type == 6) { devices.closeAudioDevice(); followDefaultOutput(); return; }
        if (type == 2) {
            if (chain.size() >= 16) { message("error", "Maximum 16 plugins"); return; }
            loadingPlugin = true;
            message("plugin-loading", juce::File(payload).getFileNameWithoutExtension());
            // Scanning a module again while its previous instance is processing
            // can re-enter vendor initialization. Cache its descriptor instead.
            if (descriptionsByPath.find(payload) == descriptionsByPath.end()) {
                juce::OwnedArray<juce::PluginDescription> descriptions;
                formats.getFormat(0)->findAllTypesForFile(descriptions, payload);
                if (descriptions.isEmpty()) { message("error", "No VST3 plugin found"); finishPluginLoad(); return; }
                descriptionsByPath.emplace(payload, *descriptions[0]);
            }
            const std::weak_ptr<int> alive = lifetime;
            formats.createPluginInstanceAsync(descriptionsByPath.at(payload), 48000, blockSize,
                [this, alive](std::unique_ptr<juce::AudioPluginInstance> plugin, const juce::String& error) {
                    if (alive.expired()) return;
                    if (!plugin) { message("error", error); finishPluginLoad(); return; }
                    plugin->disableNonMainBuses();
                    auto layout = plugin->getBusesLayout();
                    if (layout.inputBuses.isEmpty() || layout.outputBuses.isEmpty()) { message("error", "Only stereo audio effects are supported"); finishPluginLoad(); return; }
                    layout.inputBuses.set(0, juce::AudioChannelSet::stereo()); layout.outputBuses.set(0, juce::AudioChannelSet::stereo());
                    if (!plugin->setBusesLayout(layout)) { message("error", "Plugin does not support stereo input/output"); finishPluginLoad(); return; }
                    plugin->setRateAndBufferSizeDetails(48000, blockSize); plugin->prepareToPlay(48000, blockSize);
                    auto slot = std::make_unique<Slot>(); slot->id = nextId++; slot->plugin = std::move(plugin);
                    { const juce::ScopedLock lock(chainLock); chain.push_back(std::move(slot)); }
                    list(); finishPluginLoad();
                });
            return;
        }
        const int id = payload.getIntValue();
        auto iterator = std::find_if(chain.begin(), chain.end(), [id](const auto& slot) { return slot->id == id; });
        if (iterator == chain.end()) return;
        auto& slot = **iterator;
        if (type == 3) {
            if (!slot.editor) slot.editor = std::make_unique<EditorWindow>(*slot.plugin);
            slot.editor->setVisible(true); slot.editor->toFront(true);
        }
        if (type == 4) {
            std::unique_ptr<Slot> removed;
            { const juce::ScopedLock lock(chainLock); removed = std::move(*iterator); chain.erase(iterator); }
            removed->editor.reset(); removed->plugin->releaseResources(); list();
        }
        if (type == 5) { { const juce::ScopedLock lock(chainLock); slot.bypass = !slot.bypass; } list(); }
    }
    void audioDeviceAboutToStart(juce::AudioIODevice* device) override {
        deviceReady = false;
        scratch.setSize(2, device->getCurrentBufferSizeSamples());
        resampler.setResamplingRatio(48000.0 / device->getCurrentSampleRate());
        resampler.prepareToPlay(device->getCurrentBufferSizeSamples(), device->getCurrentSampleRate());
        deviceReady = true;
    }
    void prepareToPlay(int expectedBlockSize, double sampleRate) override {
        const juce::ScopedLock lock(chainLock);
        blockSize = expectedBlockSize;
        jassert(std::abs(sampleRate - 48000.0) < 1.0);
        for (auto& slot : chain) { slot->plugin->releaseResources(); slot->plugin->setRateAndBufferSizeDetails(48000, blockSize); slot->plugin->prepareToPlay(48000, blockSize); }
    }
    void releaseResources() override {
        const juce::ScopedLock lock(chainLock);
        for (auto& slot : chain) slot->plugin->releaseResources();
    }
    void audioDeviceStopped() override { deviceReady = false; resampler.releaseResources(); }
    void audioDeviceError(const juce::String&) override { deviceReady = false; }
    void getNextAudioBlock(const juce::AudioSourceChannelInfo& info) override {
        info.clearActiveBufferRegion();
        if (discardQueuedAudio.exchange(false)) fifo.finishedRead(fifo.getNumReady());
        int a, na, b, nb; fifo.prepareToRead(info.numSamples, a, na, b, nb);
        for (int ch = 0; ch < 2; ++ch) {
            info.buffer->copyFrom(ch, info.startSample, samples[static_cast<size_t>(ch)].data() + a, na);
            info.buffer->copyFrom(ch, info.startSample + na, samples[static_cast<size_t>(ch)].data() + b, nb);
        }
        fifo.finishedRead(na + nb);
        const juce::ScopedTryLock lock(chainLock);
        if (!lock.isLocked()) { info.clearActiveBufferRegion(); return; }
        for (int offset = 0; offset < info.numSamples; offset += blockSize) {
            juce::AudioBuffer<float> block(info.buffer->getArrayOfWritePointers(), 2, info.startSample + offset, std::min(blockSize, info.numSamples - offset));
            midi.clear();
            for (auto& slot : chain) if (!slot->bypass) slot->plugin->processBlock(block, midi);
        }
    }
    void audioDeviceIOCallbackWithContext(const float* const*, int, float* const* output, int channels, int frames, const juce::AudioIODeviceCallbackContext&) override {
        for (int ch = 0; ch < channels; ++ch) if (output[ch]) juce::FloatVectorOperations::clear(output[ch], frames);
        if (!deviceReady.load() || frames > scratch.getNumSamples()) return;
        resampler.getNextAudioBlock(juce::AudioSourceChannelInfo(&scratch, 0, frames));
        for (int ch = 0; ch < std::min(channels, 2); ++ch) if (output[ch]) {
            const auto* input = scratch.getReadPointer(ch);
            for (int i = 0; i < frames; ++i) output[ch][i] = std::isfinite(input[i]) ? juce::jlimit(-1.0f, 1.0f, input[i]) : 0.0f;
        }
    }
};
int main(int argc, char* argv[]) {
#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
#endif
    juce::ScopedJuceInitialiser_GUI gui;
    Host host;
    if (argc > 1 && juce::String(argv[1]) == "--test-resampling") return host.testResampling() ? 0 : 1;
    if (!host.start()) return 1;
    std::thread reader([&host] {
        while (true) {
            uint32_t header[2];
            if (std::fread(header, sizeof(header), 1, stdin) != 1) break;
            if (header[1] > 65536) break;
            std::vector<char> payload(header[1]);
            if (header[1] && std::fread(payload.data(), 1, payload.size(), stdin) != payload.size()) break;
            if (header[0] == 1) host.push(payload);
            else if (header[0] >= 2 && header[0] <= 6) {
                const auto text = juce::String::fromUTF8(payload.data(), static_cast<int>(payload.size()));
                juce::MessageManager::callAsync([&host, type = header[0], text] { host.command(type, text); });
            }
        }
        juce::MessageManager::callAsync([] { juce::MessageManager::getInstance()->stopDispatchLoop(); });
    });
    juce::MessageManager::getInstance()->runDispatchLoop();
    reader.join();
    return 0;
}
