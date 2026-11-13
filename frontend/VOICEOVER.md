# Tour voiceover

The guided tour (▶ Start tour, or **30-second cut** for the submission video) plays one recorded clip per shot.
Each step lasts exactly as long as its clip (plus a short breath), so there is nothing to sync by hand.

## Open the script sheet
Add `#voiceover` to the app URL, or press **Shift + V**. It shows, for the full tour and the 30-second cut:
- the exact words for each clip, built from the data the tour shows (numbers included)
- the file name to save it as, the shot it plays over, its length
- whether each clip is **Recorded**, **Not recorded**, or **Re-record** (recorded with different words, e.g. before the real data landed)
- buttons to hear a line with the browser's draft voice, play a recording, copy the script, copy `manifest.json`

## Record
1. Wait for the real data (`VITE_API_URL`). Lines quote numbers; record with the final ones.
2. Copy the script from the sheet. One narrator, one session, same mic. Say **MODIS = "MOH-dis"**, **VIIRS = "veers"**.
   A small soft room (or a closet of clothes) beats a big echoey one. Read a touch slower than feels natural.
3. Name the best take after its clip: `01.wav … 08.wav` (full tour), `s1.wav … s4.wav` (30-second cut).
4. `npm run voice:prepare -- path/to/takes` (needs ffmpeg): trims silence, adds a 150 ms lead-in, evens loudness to -16 LUFS,
   writes `public/audio/tour/<id>.mp3`.
5. In the sheet click **Copy manifest.json** and save it as `public/audio/tour/manifest.json`. Reload: every line should say Recorded.

## How playback behaves
- A clip only plays if the words in `manifest.json` still match the line. If the data changed, that step runs on captions
  (and the console names the clip to re-record), so the narrator never says a number the screen doesn't show.
- No recordings yet: the browser's draft voice reads the lines, for rehearsing. Once any clip exists it is never mixed in
  (configurable at the bottom of the sheet).
- Sound starts from the tour button click (browsers block sound otherwise). "Sound on/off" sits in the caption.
  Any click, scroll, globe drag or Esc stops the tour and the voice.

## Filming the 30-second video
Click **30-second cut** and record the screen **with system audio**. OBS Studio (free, macOS/Windows/Linux) does this on
every OS; set the canvas to 1920×1080 and hide the cursor. Start recording a second before you click, trim later.
