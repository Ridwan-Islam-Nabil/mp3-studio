/**
 * Feature landing pages ("tool pages"), one per search intent. Each entry becomes a statically
 * generated page at `/<slug>`, a sitemap entry, a link in the home page's
 * Tools section and in the site footer. To add a page, add an entry here plus a 10-line route
 * file `app/(tools)/<slug>/page.tsx` (copy an existing one) — see "SEO" in
 * CLAUDE.md.
 *
 * Copy rules: describe only what the editor really does (no invented stats, reviews or user
 * counts); prefer speech examples (podcasts, lectures, interviews, voice notes, nasheeds); never
 * market Quran recitation as a ringtone.
 *
 * No React, no DOM — imported by tests and by Playwright.
 */
import { SITE_NAME, absoluteUrl } from "./site";

/**
 * Values of the editor's `?tool=` query parameter. This list is a contract with the editor
 * (components/editor reads the parameter); only add an id once the editor handles it.
 */
export const EDITOR_TOOL_IDS = ["remove-silence", "normalize", "ringtone", "split", "convert"] as const;
export type EditorToolId = (typeof EDITOR_TOOL_IDS)[number];

/** Values of `?device=` (only meaningful with `tool=ringtone`). */
export const EDITOR_DEVICES = ["android"] as const;
export type EditorDevice = (typeof EDITOR_DEVICES)[number];

export interface ToolStep {
  name: string;
  text: string;
}

export interface ToolFaq {
  q: string;
  a: string;
}

export interface Tool {
  /** URL path segment: the page lives at `/<slug>`. */
  slug: string;
  /** `<title>` — unique, keyword first. */
  title: string;
  /** Meta description — unique, ~120–160 characters. */
  description: string;
  /** The page's only H1. */
  h1: string;
  /** Short name for menus, cards and "related tools" links. */
  navLabel: string;
  /** One sentence for cards. */
  summary: string;
  keywords: string[];
  /** Last content change (YYYY-MM-DD), used as the sitemap's lastModified. */
  updated: string;
  /** Which editor tool the CTA preselects; `{}` opens the plain editor. */
  editor: { tool?: EditorToolId; device?: EditorDevice };
  ctaLabel: string;
  /** Intro paragraphs (plain text). */
  intro: string[];
  /** 3–5 steps; also the HowTo JSON-LD. */
  steps: ToolStep[];
  /** Honest limits and tips ("Good to know"), plain text. */
  notes: string[];
  /** 4–6 questions; also the FAQPage JSON-LD. */
  faqs: ToolFaq[];
  /** Slugs of other tools. */
  related: string[];
  /** Slugs of blog posts in lib/posts.ts. */
  relatedPosts: string[];
}

/** `/editor` plus the tool's query string, e.g. `/editor?tool=ringtone&device=android`. */
export function editorHref(editor: Tool["editor"]): string {
  const params = new URLSearchParams();
  if (editor.tool) params.set("tool", editor.tool);
  if (editor.device) params.set("device", editor.device);
  const qs = params.toString();
  return qs ? `/editor?${qs}` : "/editor";
}

const UPDATED = "2026-11-16";

export const tools: Tool[] = [
  {
    slug: "remove-silence-from-audio",
    title: "Remove Silence From Audio Online — Free, No Upload",
    description:
      "Find and cut long pauses and dead air from a recording automatically, review every cut, then export. Free, runs in your browser, nothing is uploaded.",
    h1: "Remove silence from audio online",
    navLabel: "Remove silence",
    summary: "Detect long pauses and dead air automatically, review them, and cut them in one export.",
    keywords: [
      "remove silence from audio online",
      "cut silence from audio free",
      "remove dead air from recording",
      "remove pauses from audio",
      "silence remover no upload",
    ],
    updated: UPDATED,
    editor: { tool: "remove-silence" },
    ctaLabel: "Remove silence now — free",
    intro: [
      "Recordings of talks, interviews and podcasts often have long pauses: someone looking for a slide, a guest thinking, the gap before the recording really starts. Cutting them by hand means scrolling through the whole waveform.",
      "MP3 Studio scans the file for stretches that are quiet for a while and marks them as cuts on the waveform. You stay in control: listen, remove any cut you want to keep, adjust the edges, and only then export. Everything runs in your browser, so the recording never leaves your device.",
    ],
    steps: [
      { name: "Open your recording", text: "Drop an MP3, WAV, M4A, AAC, OGG, OPUS or FLAC file into the editor. It opens in your browser; nothing is uploaded." },
      { name: "Detect the silent parts", text: "Run silence detection. Long quiet stretches are marked as red cut regions, with a little padding left so speech doesn't sound clipped." },
      { name: "Review the cuts", text: "Play each cut, delete the ones you want to keep, drag edges or type exact times. You can also add your own cuts for coughs or mistakes." },
      { name: "Preview and export", text: "Preview the shortened result, then export it as MP3, WAV or M4A." },
    ],
    notes: [
      "Detection looks for quiet audio, not for meaning. Background music, room noise or hum can stop a pause from counting as silent; you can still mark those gaps by hand.",
      "Short natural pauses between sentences are left alone, so speech keeps its rhythm.",
      "Very long or uncompressed files (hours of WAV) use a lot of browser memory. If an export fails, try a compressed file or shorter sections.",
    ],
    faqs: [
      { q: "How do I remove silence from an audio file for free?", a: "Open the file in MP3 Studio, run silence detection, check the cuts it marks on the waveform, and export. It's free, needs no account and works in your browser." },
      { q: "Is my recording uploaded anywhere?", a: "No. Detection and export run on your device with FFmpeg compiled to WebAssembly. The file is never sent to a server." },
      { q: "Can I keep some of the pauses?", a: "Yes. Every detected pause is a normal cut region. Delete the ones you want to keep, or drag their edges to shorten them instead of removing them completely." },
      { q: "Will it cut quiet speech?", a: "It only marks audio that stays below a quiet threshold for a while, and it leaves padding around the speech. Still, review the cuts before exporting, especially on recordings where someone speaks very softly." },
      { q: "Which formats can I export?", a: "MP3, WAV or M4A. Input can be MP3, WAV, M4A, AAC, OGG, OPUS or FLAC." },
    ],
    related: ["cut-lecture-recording", "normalize-audio-volume-online", "trim-voice-note"],
    relatedPosts: ["multiple-cut-audio-trimmer-online-free", "remove-ads-from-podcast-mp3-online-free", "delete-section-from-middle-of-audio-online-free"],
  },
  {
    slug: "normalize-audio-volume-online",
    title: "Normalize Audio Volume Online — Free, No Upload",
    description:
      "Make a quiet or loud recording a consistent -16 LUFS loudness, with a limiter to stop clipping. Free, in your browser, no upload and no sign-up.",
    h1: "Normalize audio volume online",
    navLabel: "Normalize volume",
    summary: "Bring a too-quiet or too-loud recording to a standard loudness (-16 LUFS) on export.",
    keywords: [
      "normalize audio volume online",
      "normalize audio free",
      "make audio louder online",
      "loudness normalization lufs online",
      "normalize mp3 no upload",
    ],
    updated: UPDATED,
    editor: { tool: "normalize" },
    ctaLabel: "Normalize a file — free",
    intro: [
      "A lecture recorded from the back of the room, a voice note held too far from the phone, a podcast episode much quieter than the one before it: listeners end up riding the volume knob.",
      "MP3 Studio can normalize the audio while it exports. It first measures the loudness of the part you keep, then applies one gain so the result lands at -16 LUFS (a common loudness level for podcasts and spoken audio), with a limiter that keeps peaks from clipping. It all happens in your browser.",
    ],
    steps: [
      { name: "Open the file", text: "Drop your audio file into the editor. It stays on your device." },
      { name: "Trim if needed", text: "Optionally mark parts to cut first, so the loudness is measured on what you actually keep." },
      { name: "Turn on normalize", text: "Enable normalize for the export. The target is -16 LUFS with a peak limiter." },
      { name: "Preview and export", text: "Listen to the preview, then export as MP3, WAV or M4A." },
    ],
    notes: [
      "Normalize applies one gain to the whole result. It makes the file as a whole louder or quieter; it does not balance a loud speaker against a quiet one in the same recording.",
      "Very quiet recordings get a lot of gain, which also raises background hiss. Normalizing can't remove noise.",
      "Pure silence is left silent rather than being boosted.",
    ],
    faqs: [
      { q: "What does normalizing audio do?", a: "It changes the overall volume so the file reaches a target loudness. MP3 Studio measures the loudness and applies a single gain to reach -16 LUFS, then a limiter catches any peaks that would clip." },
      { q: "Why -16 LUFS?", a: "It's a widely used loudness level for podcasts and spoken-word audio on phones and laptops. It keeps speech clear without being harsh." },
      { q: "Will normalizing squash the dynamics?", a: "Not much. One constant gain is applied, so quiet and loud moments keep their relationship. Only the peaks that would go over the limit are limited." },
      { q: "Is my file uploaded?", a: "No. The measurement and the export both run in your browser with FFmpeg (WebAssembly). Nothing is sent to a server." },
      { q: "Can I normalize and cut in the same export?", a: "Yes. Mark the parts to remove, turn on normalize, and export once. The loudness is measured on the kept audio only." },
    ],
    related: ["remove-silence-from-audio", "cut-lecture-recording", "convert-audio-to-wav-mp3-m4a"],
    relatedPosts: ["remove-ads-from-podcast-mp3-online-free", "free-audio-trimmer-no-upload-no-software"],
  },
  {
    slug: "iphone-ringtone-maker",
    title: "iPhone Ringtone Maker (M4R) — Free Online, No Upload",
    description:
      "Turn a short clip of any audio into an iPhone ringtone (.m4r) up to 40 seconds long. Pick the part, export, download. Free, no upload, no app.",
    h1: "Free iPhone ringtone maker (M4R)",
    navLabel: "iPhone ringtone",
    summary: "Pick up to 40 seconds of any audio and download it as an .m4r ringtone for iPhone.",
    keywords: [
      "iphone ringtone maker",
      "make m4r ringtone online free",
      "convert audio to m4r",
      "custom iphone ringtone free",
      "ringtone maker no upload",
    ],
    updated: UPDATED,
    editor: { tool: "ringtone" },
    ctaLabel: "Make an iPhone ringtone — free",
    intro: [
      "iPhone ringtones use the .m4r format and must be 40 seconds or shorter. MP3 Studio makes that file from any audio you have: a favourite podcast quote, a voice clip from family, a nasheed, or a sound you recorded yourself.",
      "Choose the part you want and download a ready .m4r file. The audio is processed in your browser, so nothing is uploaded.",
    ],
    steps: [
      { name: "Open your audio", text: "Drop an audio file (MP3, M4A, WAV, OGG, OPUS, FLAC or AAC) into the editor." },
      { name: "Choose the clip", text: "Mark the part you want to keep. Keep it 40 seconds or shorter: iOS doesn't accept longer ringtones." },
      { name: "Export as M4R", text: "Preview it, then download it as an .m4r ringtone file." },
      { name: "Add it to your iPhone", text: "Connect the iPhone to a computer and drag the .m4r file onto it in Finder (Mac) or Apple Devices / iTunes (Windows). Then pick it in Settings → Sounds & Haptics → Ringtone." },
    ],
    notes: [
      "An iPhone can't install a ringtone straight from the Downloads folder. You need a computer (Finder, Apple Devices or iTunes) or GarageBand on the phone.",
      "Only use audio you have the right to use. A ringtone plays out loud in public, so choose something you'd be comfortable sharing.",
      "The editor works best on a computer; on a phone, short clips work but precise selection is harder.",
    ],
    faqs: [
      { q: "How long can an iPhone ringtone be?", a: "Up to 40 seconds. iOS ignores longer ringtone files, so keep your clip at 40 seconds or less." },
      { q: "What is an M4R file?", a: "It's an AAC audio file in an MPEG-4 container, the same as M4A, with the .m4r extension that iPhones expect for ringtones." },
      { q: "Do I need iTunes or an app?", a: "You don't need anything to make the file. To put it on the iPhone you need Finder on a Mac, Apple Devices or iTunes on Windows, or GarageBand on the phone itself." },
      { q: "Is the audio uploaded to make the ringtone?", a: "No. The clip is cut and converted in your browser with FFmpeg (WebAssembly). Your file stays on your device." },
      { q: "Can I make a ringtone for Android too?", a: "Yes. Android phones use regular MP3 files; see the Android ringtone maker." },
    ],
    related: ["android-ringtone-maker", "convert-audio-to-wav-mp3-m4a", "trim-voice-note"],
    relatedPosts: ["trim-audio-millisecond-precision-online-free", "free-audio-trimmer-no-upload-no-software"],
  },
  {
    slug: "android-ringtone-maker",
    title: "Android Ringtone Maker — Free MP3 Ringtones Online",
    description:
      "Cut a short clip from any audio file and save it as an MP3 ringtone for your Android phone. Free, runs in your browser, nothing uploaded.",
    h1: "Free Android ringtone maker",
    navLabel: "Android ringtone",
    summary: "Cut a short clip from any audio and save it as an MP3 ringtone for Android phones.",
    keywords: [
      "android ringtone maker",
      "make mp3 ringtone online free",
      "custom ringtone android free",
      "ringtone cutter online",
      "ringtone maker no upload",
    ],
    updated: UPDATED,
    editor: { tool: "ringtone", device: "android" },
    ctaLabel: "Make an Android ringtone — free",
    intro: [
      "Android phones accept ordinary MP3 files as ringtones, so making one is mostly about picking the right few seconds: a line from a podcast, a voice clip, a nasheed, or a sound you recorded.",
      "MP3 Studio lets you select exactly that part on a waveform and download a small MP3. Everything runs in your browser.",
    ],
    steps: [
      { name: "Open your audio", text: "Drop an audio file into the editor. It isn't uploaded anywhere." },
      { name: "Choose the clip", text: "Mark the part you want to keep. Ringtones usually work best between 15 and 30 seconds." },
      { name: "Export as MP3", text: "Preview it and download the MP3." },
      { name: "Set it as your ringtone", text: "Copy the file to your phone (or download it there), then choose it in Settings → Sound → Phone ringtone. Menu names differ between manufacturers." },
    ],
    notes: [
      "Android has no fixed length limit, but long ringtones are cut off when the call goes to voicemail anyway.",
      "On some phones the file has to be in the Ringtones folder before it shows up in the list.",
      "Only use audio you have the right to use.",
    ],
    faqs: [
      { q: "What format do Android ringtones use?", a: "MP3 works on practically every Android phone. M4A and OGG usually work too, but MP3 is the safe choice." },
      { q: "How long should an Android ringtone be?", a: "There's no fixed limit. Around 15–30 seconds is plenty, because a call rarely rings longer before voicemail." },
      { q: "Can I do this on my phone?", a: "The editor opens in a mobile browser and short clips work, but selecting an exact moment is easier on a computer with a mouse." },
      { q: "Is my file uploaded?", a: "No. The clip is cut and encoded in your browser with FFmpeg (WebAssembly). Nothing leaves your device." },
      { q: "Can I make an iPhone ringtone instead?", a: "Yes. The iPhone ringtone maker exports the .m4r format iPhones need, up to 40 seconds." },
    ],
    related: ["iphone-ringtone-maker", "trim-voice-note", "convert-audio-to-wav-mp3-m4a"],
    relatedPosts: ["trim-audio-millisecond-precision-online-free", "delete-section-from-middle-of-audio-online-free"],
  },
  {
    slug: "split-audio-into-parts",
    title: "Split Audio Into Parts Online — Free, No Upload",
    description:
      "Cut a long recording into separate parts: select a section, export it as its own file, then the next. Free, in your browser, nothing is uploaded.",
    h1: "Split audio into parts online",
    navLabel: "Split audio",
    summary: "Save sections of a long recording as separate files, one part at a time.",
    keywords: [
      "split audio into parts online",
      "split mp3 into parts free",
      "cut audio into sections",
      "split long recording",
      "audio splitter no upload",
    ],
    updated: UPDATED,
    editor: { tool: "split" },
    ctaLabel: "Split a recording — free",
    intro: [
      "A two-hour class you want to share as separate lessons, an interview that should become a few short clips, a long voice memo with three different topics: sometimes one file needs to become several.",
      "In MP3 Studio you select a section on the waveform and export just that section as its own file. Then select the next part and export again. Your file stays in your browser the whole time.",
    ],
    steps: [
      { name: "Open the recording", text: "Drop the long audio file into the editor. Nothing is uploaded." },
      { name: "Select the first part", text: "Mark the section you want as part 1. Zoom in or type exact start and end times to get the boundary right." },
      { name: "Export that section", text: "Export it as MP3, WAV or M4A and give it a name like “lesson-01”." },
      { name: "Repeat for each part", text: "Select the next section and export it the same way, until every part is saved." },
    ],
    notes: [
      "Parts are exported one at a time. There's no one-click “split into N files” button yet.",
      "Your file stays loaded between exports, so you don't re-open it for each part.",
      "Each export is a new file; the original recording is never changed.",
    ],
    faqs: [
      { q: "How do I split an MP3 into several files for free?", a: "Open it in MP3 Studio, select the first part and export it, then select the next part and export again. Each part becomes its own file. It's free and nothing is uploaded." },
      { q: "Can it split automatically into equal parts?", a: "Not at the moment. You choose each part yourself, which is usually what you want for lessons, chapters or topics that don't have equal lengths." },
      { q: "Can I export all parts at once?", a: "Not yet: parts are exported one at a time. The file stays open, so each additional part only takes a few clicks." },
      { q: "Will the parts lose quality?", a: "Each part is decoded and encoded once. For the best quality, export as WAV; MP3 and M4A are much smaller and sound the same for speech in normal listening." },
      { q: "Is the recording uploaded?", a: "No. Everything runs in your browser with FFmpeg (WebAssembly)." },
    ],
    related: ["cut-lecture-recording", "convert-audio-to-wav-mp3-m4a", "remove-silence-from-audio"],
    relatedPosts: ["delete-section-from-middle-of-audio-online-free", "cut-multiple-parts-from-mp3-online-free"],
  },
  {
    slug: "convert-audio-to-wav-mp3-m4a",
    title: "Convert Audio to MP3, WAV or M4A Online — Free",
    description:
      "Convert MP3, WAV, M4A, AAC, OGG, OPUS or FLAC files to MP3, WAV or M4A in your browser. Trim while you convert. Free, no upload, no sign-up.",
    h1: "Convert audio to MP3, WAV or M4A",
    navLabel: "Convert audio",
    summary: "Turn OGG, OPUS, FLAC, WAV and other files into MP3, WAV or M4A, trimming as you go.",
    keywords: [
      "convert audio to mp3 online",
      "convert audio to wav online free",
      "convert to m4a online",
      "opus to mp3 converter",
      "audio converter no upload",
    ],
    updated: UPDATED,
    editor: { tool: "convert" },
    ctaLabel: "Convert a file — free",
    intro: [
      "Some apps only take MP3, some editors want WAV, and Apple devices like M4A. MP3 Studio converts between them in your browser: open a file, choose the output format, export.",
      "Because it's also a trimmer, you can cut the parts you don't need in the same step. With no cuts, the whole file is converted.",
    ],
    steps: [
      { name: "Open the file", text: "Drop an MP3, WAV, M4A, AAC, OGG, OPUS or FLAC file into the editor. It isn't uploaded." },
      { name: "Choose the output format", text: "Pick MP3 (small, plays everywhere), WAV (uncompressed, for editing) or M4A (AAC, good for Apple devices)." },
      { name: "Trim if you like", text: "Optionally mark parts to remove. Leave it as is to convert the whole file." },
      { name: "Export", text: "Download the converted file. Your original stays untouched." },
    ],
    notes: [
      "Converting a compressed file (MP3, M4A, OGG) to WAV doesn't bring back quality that was lost when it was compressed; it only makes the file bigger and easier to edit elsewhere.",
      "Output is 44.1 kHz. By default MP3 uses a variable bitrate around 190 kbps and M4A uses AAC at 192 kbps; WAV is 16-bit PCM.",
      "Long WAV or FLAC files use a lot of browser memory; very long ones may fail on low-memory devices.",
    ],
    faqs: [
      { q: "Which formats can I convert from?", a: "MP3, WAV, M4A, AAC, OGG, OPUS and FLAC, as long as your browser can decode them (current desktop Chrome, Edge and Firefox handle all of these)." },
      { q: "Which formats can I convert to?", a: "MP3, WAV and M4A (AAC). For iPhone ringtones there's also .m4r on the iPhone ringtone maker page." },
      { q: "Should I choose MP3, WAV or M4A?", a: "MP3 for sharing and maximum compatibility, M4A for slightly smaller files at similar quality on Apple devices, WAV when another program needs uncompressed audio." },
      { q: "Are my files uploaded to convert them?", a: "No. Conversion runs on your device with FFmpeg compiled to WebAssembly." },
      { q: "Is there a watermark or limit?", a: "No watermark, no account and no server-side size limit. The practical limit is your device's memory." },
    ],
    related: ["trim-voice-note", "iphone-ringtone-maker", "normalize-audio-volume-online"],
    relatedPosts: ["free-audio-trimmer-no-upload-no-software", "audacity-alternative-online-free-no-download"],
  },
  {
    slug: "trim-voice-note",
    title: "Trim a Voice Note Online — WhatsApp & Telegram, Free",
    description:
      "Cut the start, end or middle of a WhatsApp or Telegram voice note (.opus, .ogg) and save it as MP3. Free, private, nothing uploaded.",
    h1: "Trim a WhatsApp or Telegram voice note",
    navLabel: "Trim a voice note",
    summary: "Open .opus and .ogg voice notes, cut the parts you don't need, save as MP3.",
    keywords: [
      "trim voice note",
      "cut whatsapp voice note",
      "edit telegram voice message",
      "opus to mp3 trim",
      "trim voice message online free",
    ],
    updated: UPDATED,
    editor: {},
    ctaLabel: "Trim a voice note — free",
    intro: [
      "Voice notes are often longer than they need to be: a few seconds of fumbling at the start, a pause in the middle, a goodbye you don't want to forward. WhatsApp saves voice notes as .opus files and Telegram as .ogg files, which many trimmers won't open.",
      "MP3 Studio opens both, lets you cut any part, and saves the result as an MP3 that plays everywhere. Voice notes are personal, so it matters that the file is processed in your browser and never uploaded.",
    ],
    steps: [
      { name: "Save the voice note as a file", text: "Export or share it from the chat to your files (on WhatsApp Desktop or Telegram Desktop you can also save it directly). You'll get an .opus or .ogg file." },
      { name: "Open it in the editor", text: "Drop the file into MP3 Studio. It opens in your browser without being uploaded." },
      { name: "Mark what to remove", text: "Drag over the start, the end, or any part in the middle. Each marked part turns red and will be cut." },
      { name: "Export", text: "Preview the result, then save it as MP3 (or WAV / M4A)." },
    ],
    notes: [
      "Chrome, Edge and Firefox open .opus and .ogg files. Some Safari versions can't decode them; if the file doesn't open, try Chrome or Edge.",
      "The saved file is a normal audio file. Sending it back into a chat usually shows it as an audio attachment rather than as a voice-note bubble.",
      "Only edit and share voice notes you have permission to share.",
    ],
    faqs: [
      { q: "Can I open WhatsApp .opus voice notes?", a: "Yes. The editor accepts .opus and .ogg files and decodes them with your browser's audio support, which covers Chrome, Edge and Firefox." },
      { q: "How do I cut out the middle of a voice note?", a: "Drag over the middle part on the waveform so it turns red, then export. Everything outside the red part is kept and joined." },
      { q: "Is the voice note uploaded to a server?", a: "No. Everything happens in your browser. The file never leaves your device." },
      { q: "What format do I get?", a: "MP3 by default, which plays on any phone or computer. You can also choose WAV or M4A." },
      { q: "Can I make the voice note louder?", a: "Yes. Turn on normalize when exporting to bring a quiet voice note to a standard loudness." },
    ],
    related: ["normalize-audio-volume-online", "convert-audio-to-wav-mp3-m4a", "remove-silence-from-audio"],
    relatedPosts: ["free-audio-trimmer-no-upload-no-software", "trim-audio-millisecond-precision-online-free"],
  },
  {
    slug: "cut-lecture-recording",
    title: "Cut a Lecture Recording Online — Remove Silence, Free",
    description:
      "Edit a recorded lecture, khutbah, class or podcast: remove long silences, cut the setup at the start, clip parts to share. Free, nothing uploaded.",
    h1: "Cut and clean up a lecture recording",
    navLabel: "Cut a lecture",
    summary: "Tidy up lectures, khutbahs, classes and podcasts: remove silences, cut setup time, clip highlights.",
    keywords: [
      "cut lecture recording",
      "edit lecture audio online",
      "remove silence from lecture",
      "trim khutbah recording",
      "clip podcast segment online",
    ],
    updated: UPDATED,
    editor: { tool: "remove-silence" },
    ctaLabel: "Clean up a lecture — free",
    intro: [
      "Recorded lectures, khutbahs, classes and podcast episodes usually include minutes of setup before the speaker starts, long pauses while slides change or questions are passed around, and a tail after it ends.",
      "MP3 Studio can find the long silences for you and mark them as cuts. Add your own cuts for the setup and the ending, normalize a quiet room recording, and export one clean file. To share a single topic, export just that section as a separate clip. Nothing is uploaded.",
    ],
    steps: [
      { name: "Open the recording", text: "Drop the lecture or podcast file into the editor. Long recordings are fine; compressed formats like MP3 or M4A use the least memory." },
      { name: "Remove long silences", text: "Run silence detection and review the cuts it marks on the waveform." },
      { name: "Cut the start, the end and any interruptions", text: "Drag over the setup before the talk begins, the chatter after it ends, and anything else you don't want. Use zoom or typed times for exact edges." },
      { name: "Export the cleaned file or a clip", text: "Export the whole cleaned recording, optionally normalized, or export one section as its own clip to share." },
    ],
    notes: [
      "Detection marks quiet stretches. In a noisy hall or with background chatter, some pauses may not count as silent; mark those by hand.",
      "For a series of clips from one recording, export them one at a time (see Split audio into parts).",
      "Recordings that are several hours long in WAV format may run out of browser memory; convert to MP3 first or work in sections.",
    ],
    faqs: [
      { q: "How do I remove the silent parts from a lecture recording?", a: "Open it in MP3 Studio and run silence detection. Long quiet stretches are marked as cuts; check them, keep any you want, and export." },
      { q: "Can I clip one part of a lecture to share?", a: "Yes. Select the part you want and export just that section as its own MP3, WAV or M4A file." },
      { q: "The speaker is too quiet. Can I fix that?", a: "Turn on normalize when exporting. It raises the whole recording to a standard loudness (-16 LUFS); it can't separate the speaker from room noise, though." },
      { q: "Does it work for khutbah and class recordings?", a: "Yes. Any spoken recording works the same way, whether it's a khutbah, a class, a talk or a podcast episode." },
      { q: "Is the recording uploaded?", a: "No. Everything runs in your browser, which also makes it suitable for private classes and internal talks." },
      { q: "Which files can I open?", a: "MP3, WAV, M4A, AAC, OGG, OPUS and FLAC." },
    ],
    related: ["remove-silence-from-audio", "split-audio-into-parts", "normalize-audio-volume-online"],
    relatedPosts: ["multiple-cut-audio-trimmer-online-free", "remove-ads-from-podcast-mp3-online-free", "cut-multiple-parts-from-mp3-online-free"],
  },
];

export function getToolBySlug(slug: string): Tool | undefined {
  return tools.find((t) => t.slug === slug);
}

/** JSON-LD blocks for a tool page: HowTo, FAQPage and BreadcrumbList. */
export function toolJsonLd(tool: Tool): Record<string, unknown>[] {
  const url = absoluteUrl(`/${tool.slug}`);
  return [
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: tool.h1,
      description: tool.description,
      url,
      tool: { "@type": "HowToTool", name: `${SITE_NAME} (free, runs in your browser)` },
      step: tool.steps.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.name,
        text: s.text,
        url: `${url}#step-${i + 1}`,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: tool.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: tool.navLabel, item: url },
      ],
    },
  ];
}

