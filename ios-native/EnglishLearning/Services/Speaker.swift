import AVFoundation
import Combine

/// Reads a sentence aloud with the system voice of the learning language
/// (the pattern cards' "Dinle"). One sentence at a time: a new one stops
/// the last, and the same one again stops it.
@MainActor
final class Speaker: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    static let shared = Speaker()

    /// The sentence being read, so its button can show it is playing.
    @Published private(set) var speaking: String? = nil

    private let synthesizer = AVSpeechSynthesizer()

    private override init() {
        super.init()
        synthesizer.delegate = self
    }

    func toggle(_ text: String, language: LearningLanguage) {
        let wasThis = speaking == text
        stop()
        guard !wasThis else { return }
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = Self.voice(for: language)
        // A little slower than conversation, for learners.
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.85
        speaking = text
        synthesizer.speak(utterance)
    }

    func stop() {
        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        speaking = nil
    }

    /// The best installed voice for the locale, else any voice of the language.
    private static func voice(for language: LearningLanguage) -> AVSpeechSynthesisVoice? {
        let code = language.speechLanguage
        let voices = AVSpeechSynthesisVoice.speechVoices()
        let best = voices.filter { $0.language == code }.max { $0.quality.rawValue < $1.quality.rawValue }
        return best ?? AVSpeechSynthesisVoice(language: code)
            ?? voices.first { $0.language.hasPrefix(String(code.prefix(2))) }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let text = utterance.speechString
        Task { @MainActor in if self.speaking == text { self.speaking = nil } }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        let text = utterance.speechString
        Task { @MainActor in if self.speaking == text { self.speaking = nil } }
    }
}
