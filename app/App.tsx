import { useEffect, useRef, useState } from 'react'
import { Box, Button, Divider, MenuItem, Select, Snackbar, Stack, Typography, useColorScheme } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCirclePlay, faFolderOpen, faPause, faPlay, faRightLeft, faStop } from '@fortawesome/free-solid-svg-icons'
import {
  AppHeader, BottomBar, DesktopLayout, FULL_HEIGHT, JobGauge, LicensesDialog, MobileLayout, PevenLabels, StatusBar, StatusItem, StatusSpacer,
  WindowModeContext, autoWindowMode, setUiScale, startJob, useAddonInstall, useFileDrop, useFilePicker, useMobileLayout, useShortcuts,
} from 'pevenmui'
import { UpdatePrompt, checkForUpdate, promptUpdate } from 'pevenmui/pwa'
import { configureFileAccess } from 'pevenmui/web'
import { AUDIO_ACCEPT, decodeFile, isWvspFile, readWvsp, WVSP_EXT, WvspError, type Clip, type Range } from 'wevocal-lib'
import { ZOOM_STEP, useWaveformView } from 'wevocal-lib/react'
import { findMoraeInLyrics, type MoraRange } from '../src/index'
import { useAnalysis } from './useAnalysis'
import { useCompare } from './useCompare'
import AboutDialog, { APP_BUILD, AppIcon } from './AboutDialog'
import AnalysisPanel from './AnalysisPanel'
import { i18n, LangContext, resolveLang, setLang, t } from './i18n'
import { keyLabelOf, resolveKeymap } from './keymap'
import { licenseEntries } from './licenses'
import { analysisCsv, downloadAnalysisCsv, downloadLabels, downloadLyricsSrt } from './exportCsv'
import LabelsDialog from './LabelsDialog'
import type { Label } from '../src/labels'
import type { LyricsSegment } from '../src/lyricsTypes'
import { addons, type LyricsAddon } from './addons'
import LyricsDialog from './LyricsDialog'
import LyricsEditDialog from './LyricsEditDialog'
import LiveTime from './LiveTime'
import { appMenus } from './menus'
import SettingsDialog from './SettingsDialog'
import { useSettings } from './settings'
import ShortcutsDialog from './ShortcutsDialog'
import { usePlayer } from './usePlayer'
import ViewTools, { SmallButton } from './ViewTools'
import WaveView, { type Hover } from './WaveView'
import { FREQ_ZOOM_STEP, zoomFreq, type FreqRange } from './lanes'
import type { Lane } from './layout'
import { app } from './appConfig'

/** 画面の組み立て（WeVocalSynth と同じ部品と作り）。配置は PevenMUI、波形は wevocal-lib */
export default function App() {
  const [settings, updateSettings] = useSettings()
  // 子の描画より先に言語を切り替えておく（t() は描画中に参照される）
  const lang = resolveLang(settings.language)
  setLang(lang)
  const { setMode } = useColorScheme()
  useEffect(() => setMode(settings.theme), [settings.theme, setMode])
  useEffect(() => setUiScale(settings.uiScale), [settings.uiScale])
  const mobile = useMobileLayout()

  const [clip, setClip] = useState<Clip | null>(null)
  const [name, setName] = useState('')
  // WeVocalSynth のプロジェクト（.wvsp）を開いたときのトラック（加工後の音）。トラックが 2 本以上なら、ツールバーで選ぶ
  const [projectTracks, setProjectTracks] = useState<{ name: string; clip: Clip; original: Clip }[]>([])
  const [trackIndex, setTrackIndex] = useState(0)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'about' | 'licenses' | 'shortcuts' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 設定を開いたまま、もう一度「設定」を押したら、別の窓で開いている設定画面を手前に出す
  const [settingsFocus, setSettingsFocus] = useState(0)
  // 歌詞（文字化していなければ null）と、文字化のダイアログ
  const [lyrics, setLyricsState] = useState<LyricsSegment[] | null>(null)
  // 一音ずつの範囲（歌詞と読みから求める。歌詞が変わったら消す）
  const [morae, setMorae] = useState<MoraRange[] | null>(null)
  const setLyrics = (l: LyricsSegment[] | null) => {
    setLyricsState(l)
    setMorae(null)
  }
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [lyricsEditOpen, setLyricsEditOpen] = useState(false)
  // ラベル（注釈）と、その一覧のダイアログ
  const [labels, setLabels] = useState<Label[]>([])
  const [labelsOpen, setLabelsOpen] = useState(false)
  const lyricsAbort = useRef<AbortController | null>(null)
  // スペクトログラムで見る周波数の範囲（縦の拡大。null なら全体）
  const [freqRange, setFreqRange] = useState<FreqRange | null>(null)
  // カーソルの下の時刻（右の欄に値を出す。外に出たら再生位置の値）
  const [hover, setHover] = useState<Hover | null>(null)
  // 選択範囲（1 つだけ）。別のファイルを開いたら外す
  const [selection, setSelection] = useState<Range | null>(null)
  // 比較の音声（B）
  const compare = useCompare(settings, setError)
  const player = usePlayer(clip, compare.source)
  const view = useWaveformView(player.duration, player.livePosition, player.playing, settings.follow, '', settings.wheelZoom)
  const keymap = resolveKeymap(settings.keymap)

  // 追加機能を選んだフォルダーに保存するか（試験的。PevenMUI の追加機能の仕組みに渡す）
  useEffect(() => addons.folder.setEnabled(settings.addonFolder), [settings.addonFolder])
  // 別のファイルを開いたら、選択と縦の拡大、歌詞、ラベルを戻す
  useEffect(() => {
    setSelection(null)
    setFreqRange(null)
    setLyrics(null)
    setLabels([])
    lyricsAbort.current?.abort()
  }, [clip])
  const { spec, pitch, formants, level } = useAnalysis(clip, settings, setError)
  const openCompare = (file: File) =>
    compare.openFile(file).catch((e) => setError(t('error.open', { message: e instanceof WvspError ? t('error.wvspInvalid') : e instanceof Error ? e.message : String(e) })))

  const open = async (file: File) => {
    try {
      setError('')
      if (isWvspFile(file)) {
        // プロジェクトは、編集していたトラックの加工後の音を開く
        const p = await readWvsp(file)
        const list = p.tracks.map((tr) => ({ name: tr.info.name, clip: tr.edited, original: tr.original }))
        setProjectTracks(list)
        setTrackIndex(p.active)
        setClip(list[p.active].clip)
        setName(file.name)
        return
      }
      setProjectTracks([])
      setClip(await decodeFile(file))
      setName(file.name)
    } catch (e) {
      const message = e instanceof WvspError ? t(e.code === 'unsupported' ? 'error.wvspUnsupported' : 'error.wvspInvalid') : e instanceof Error ? e.message : String(e)
      setError(t('error.open', { message }))
    }
  }
  /** プロジェクトのトラックを切り替える */
  const selectTrack = (i: number) => {
    setTrackIndex(i)
    setClip(projectTracks[i].clip)
  }
  // 開く画面はフォルダを覚える。最近使用したファイルの一覧はないので記録しない
  configureFileAccess({ rememberFolder: true, startFolder: 'music', recentFiles: false, pickerMode: 'auto' })
  // 音声ファイルのほか、WeVocalSynth のプロジェクト（.wvsp）も開ける
  const picker = useFilePicker(`${AUDIO_ACCEPT},${WVSP_EXT}`, (f) => void open(f), t('file.audioType'))
  const comparePicker = useFilePicker(`${AUDIO_ACCEPT},${WVSP_EXT}`, (f) => void openCompare(f), t('file.audioType'))
  useFileDrop((f) => void open(f))

  // 再生位置の移動（WeVocalSynth の useSeek と同じ量。少しずつは 0.1 秒）。画面の外に出たら表示範囲を動かす
  const seekTo = (to: number) => {
    const t1 = Math.max(0, Math.min(player.duration, to))
    player.seek(t1)
    view.reveal(t1)
  }
  const seekBy = (sec: number) => seekTo(player.livePosition() + sec)
  const center = view.view.start + view.view.dur / 2
  const zoomIn = () => view.zoomAround(ZOOM_STEP, center)
  const zoomOut = () => view.zoomAround(1 / ZOOM_STEP, center)
  const toggleSet = (k: 'follow' | 'showFormants' | 'showHarmonics') => updateSettings({ [k]: !settings[k] })
  // 帯の表示の切り替え（1 つは必ず残す）
  const toggleLane = (lane: Lane) => {
    const next = { ...settings.lanes, [lane]: !settings.lanes[lane] }
    if (Object.values(next).some(Boolean)) updateSettings({ lanes: next })
  }
  // スペクトログラムの縦の拡大。メニューからは今の範囲の真ん中（対数の周波数軸）を中心にする
  const fullFreq: FreqRange | null = spec ? [spec.minHz, spec.maxHz] : null
  const freqZoom = (center: number | null, factor: number) => {
    if (!fullFreq) return
    const [lo, hi] = freqRange ?? fullFreq
    setFreqRange(zoomFreq(fullFreq, freqRange, center ?? Math.sqrt(lo * hi), factor))
  }
  const openSettings = () => {
    setSettingsOpen(true)
    setSettingsFocus((n) => n + 1)
  }
  // 新しい版があれば、右下の通知（UpdatePrompt）からそのまま更新できる。ここでは結果だけを知らせる
  const checkUpdate = () =>
    void checkForUpdate().then((r) => {
      if (r.kind === 'found') return promptUpdate(r.build)
      const l = i18n.labels(lang)
      setToast({ latest: l.updateLatest, unsupported: l.updateUnsupported, failed: l.updateFailed }[r.kind])
    })

  const has = !!clip
  // 歌詞の文字化（モデルの取得の進み具合と、認識中であることをゲージに出す）。終わったら歌詞の帯を出す
  const addonInstall = useAddonInstall()
  const runLyrics = async (device: 'webgpu' | 'wasm') => {
    if (!clip) return
    // 文字化は追加機能（未導入なら導入のダイアログを出す）
    // 文字化の処理と、選んだ大きさのモデル
    if (!(await addonInstall.ensure(`whisper-${settings.lyricsModel}`))) return
    const lyricsAddon = await addons.loadAddon<LyricsAddon>('analyzer-lyrics').catch((e: unknown) => {
      setToast(t('lyrics.failed', { message: e instanceof Error ? e.message : String(e) }))
      return null
    })
    if (!lyricsAddon) return
    lyricsAbort.current?.abort()
    const ac = new AbortController()
    lyricsAbort.current = ac
    const job = startJob('lyrics', t('job.kind.lyrics'), () => ac.abort())
    lyricsAddon.transcribeLyrics(clip, {
      model: settings.lyricsModel,
      device,
      language: settings.lyricsLanguage,
      signal: ac.signal,
      onDownload: (p) => job.update(p),
      onTranscribe: () => job.update(-1),
    })
      .then((segments) => {
        setLyrics(segments)
        updateSettings({ lanes: { ...settings.lanes, lyrics: true } })
      })
      .catch((e) => !ac.signal.aborted && setToast(t('lyrics.failed', { message: e instanceof Error ? e.message : String(e) })))
      .finally(job.end)
  }
  // 一音ずつに分ける（読みのある区間だけ。進み具合はゲージ）
  const runMorae = () => {
    if (!clip || !lyrics) return
    const ac = new AbortController()
    const job = startJob('morae', t('job.kind.morae'), () => ac.abort())
    findMoraeInLyrics(clip, lyrics, { signal: ac.signal, onProgress: (p) => job.update(p) })
      .then((m) => {
        setMorae(m)
        updateSettings({ lanes: { ...settings.lanes, lyrics: true } })
      })
      .catch((e) => !ac.signal.aborted && setToast(t('lyrics.failed', { message: e instanceof Error ? e.message : String(e) })))
      .finally(job.end)
  }
  // 選択範囲（なければ再生位置の点）にラベルを付け、帯を出して一覧を開く（文字はそこで入れる）
  const addLabel = () => {
    const at = selection ?? { start: player.position, end: player.position }
    setLabels((l) => [...l, { ...at, text: '' }])
    if (!settings.lanes.labels) updateSettings({ lanes: { ...settings.lanes, labels: true } })
    setLabelsOpen(true)
  }
  const playSelection = () => selection && player.playRange(selection.start, selection.end)
  const selectAll = () => setSelection({ start: 0, end: player.duration })
  useShortcuts(keymap, {
    playPause: has ? player.toggle : undefined,
    playSelection: selection ? playSelection : undefined,
    selectAll: has ? selectAll : undefined,
    clearSelection: selection ? () => setSelection(null) : undefined,
    seekBack: has ? () => seekBy(-1) : undefined,
    seekForward: has ? () => seekBy(1) : undefined,
    seekBackFine: has ? () => seekBy(-0.1) : undefined,
    seekForwardFine: has ? () => seekBy(0.1) : undefined,
    seekStart: has ? () => seekTo(0) : undefined,
    seekEnd: has ? () => seekTo(player.duration) : undefined,
    open: picker.open,
    addLabel: has ? addLabel : undefined,
    switchSource: compare.source ? player.switchSource : undefined,
  })

  const menus = appMenus(
    {
      keymap, wheelZoom: settings.wheelZoom, hasClip: has, hasSelection: !!selection, playing: player.playing, zoomed: view.zoomed, canZoomIn: view.canZoomIn,
      follow: settings.follow, lanes: settings.lanes, freqZoomed: !!freqRange, showFormants: settings.showFormants, showHarmonics: settings.showHarmonics,
      open: picker.open, hasLyrics: !!lyrics, hasLabels: labels.length > 0,
      comparing: !!compare.source, listenCompare: player.listenAlt, switchSource: player.switchSource, openCompare: comparePicker.open, closeCompare: compare.close,
      compareOriginal: projectTracks[trackIndex] && projectTracks[trackIndex].original !== projectTracks[trackIndex].clip ? () => compare.setClip(t('compare.original', { name: projectTracks[trackIndex].name }), projectTracks[trackIndex].original) : undefined,
      compareTracks: projectTracks.map((tr) => ({ name: tr.name, onClick: () => compare.setClip(tr.name, tr.clip) })).filter((_, i) => i !== trackIndex), addLabel, editLabels: () => setLabelsOpen(true), exportTextGrid: () => downloadLabels(name, labels, player.duration, 'textgrid'), exportLabelText: () => downloadLabels(name, labels, player.duration, 'txt'), exportSrt: () => lyrics && downloadLyricsSrt(name, lyrics), transcribe: () => setLyricsOpen(true), editLyrics: () => setLyricsEditOpen(true), hasReadings: !!lyrics?.some((s) => s.reading), splitMorae: runMorae, hasResults: !!pitch, exportCsv: () => pitch && downloadAnalysisCsv(name, analysisCsv(pitch, formants, level, selection)), showSettings: openSettings, toggleLane, freqZoomIn: () => freqZoom(null, FREQ_ZOOM_STEP), freqZoomOut: () => freqZoom(null, 1 / FREQ_ZOOM_STEP), freqZoomReset: () => setFreqRange(null), toggleFormants: () => toggleSet('showFormants'), toggleHarmonics: () => toggleSet('showHarmonics'),
      zoomIn, zoomOut, showAll: view.showAll, toggleFollow: () => toggleSet('follow'), togglePlay: player.toggle, stop: player.stop, playSelection, selectAll, clearSelection: () => setSelection(null),
      seekStart: () => seekTo(0), seekEnd: () => seekTo(player.duration),
      showShortcuts: () => setDialog('shortcuts'), checkUpdate, showLicenses: () => setDialog('licenses'), showAbout: () => setDialog('about'),
    },
    mobile,
  )

  const time = <LiveTime position={player.position} playing={player.playing} livePosition={player.livePosition} duration={player.duration} onSeek={has ? seekTo : undefined} />
  const transport = (
    <>
      <SmallButton title={t(player.playing ? 'play.pause' : 'play.play')} icon={player.playing ? faPause : faPlay} disabled={!has} onClick={player.toggle} />
      <SmallButton title={t('common.stop')} icon={faStop} disabled={!has} onClick={player.stop} />
      <SmallButton title={t('play.playSelection')} icon={faCirclePlay} disabled={!selection} onClick={playSelection} />
      {compare.source && <SmallButton title={[t('play.listenCompare'), keyLabelOf(keymap, 'switchSource')].filter(Boolean).join(' ')} icon={faRightLeft} pressed={player.listenAlt} onClick={player.switchSource} />}
    </>
  )
  // プロジェクトのトラックを選ぶ欄（トラックが 2 本以上のときだけ）
  const trackSelect = projectTracks.length > 1 && (
    <Select size="small" value={trackIndex} onChange={(e) => selectTrack(Number(e.target.value))} aria-label={t('project.track')} sx={{ ml: 'auto', fontSize: 13, '& .MuiSelect-select': { py: 0.5 } }}>
      {projectTracks.map((tr, i) => (
        <MenuItem key={i} value={i} sx={{ fontSize: 13 }}>
          {tr.name}
        </MenuItem>
      ))}
    </Select>
  )
  const viewTools = (
    <ViewTools
      disabled={!has}
      wheelZoom={settings.wheelZoom}
      zoomed={view.zoomed}
      canZoomIn={view.canZoomIn}
      onZoomOut={zoomOut}
      onZoomIn={zoomIn}
      onShowAll={view.showAll}
      follow={settings.follow}
      onFollowChange={(follow) => updateSettings({ follow })}
      lanes={settings.lanes}
      onLaneToggle={toggleLane}
      showFormants={settings.showFormants}
      onShowFormantsChange={(showFormants) => updateSettings({ showFormants })}
      showHarmonics={settings.showHarmonics}
      onShowHarmonicsChange={(showHarmonics) => updateSettings({ showHarmonics })}
    />
  )
  const editor = clip ? (
    <WaveView
      clip={clip}
      spec={spec}
      pitch={pitch}
      formants={formants}
      level={level}
      lyrics={lyrics}
      labels={labels}
      compare={compare.source && { name: compare.source.name, analysis: compare.analysis, offset: compare.source.offset }}
      morae={morae}
      lanes={settings.lanes}
      weights={settings.laneWeights}
      onWeightsChange={(laneWeights) => updateSettings({ laneWeights })}
      showFormants={settings.showFormants}
      showHarmonics={settings.showHarmonics}
      freqRange={freqRange}
      onFreqZoom={(hz, factor) => freqZoom(hz, factor)}
      onHover={setHover}
      view={view}
      position={player.position}
      playing={player.playing}
      livePosition={player.livePosition}
      onSeek={player.seek}
      selection={selection}
      onSelectionChange={setSelection}
    />
  ) : (
    // ファイルを開く前の画面（WeVocalSynth の EmptyState と同じ形）
    <Stack sx={{ height: '100%', alignItems: 'center', justifyContent: 'center', gap: 2, p: 2, textAlign: 'center' }}>
      <Typography variant="body2" color="text.secondary">
        {t('empty.formats')}
      </Typography>
      <Button variant="contained" startIcon={<FontAwesomeIcon icon={faFolderOpen} />} onClick={picker.open}>
        {t('empty.choose')}
      </Button>
      {error && (
        <Typography className="selectable" sx={{ color: 'error.main', fontSize: 13 }}>
          {error}
        </Typography>
      )}
    </Stack>
  )
  const analysis = <AnalysisPanel clip={clip} lyrics={lyrics} spec={spec} pitch={pitch} formants={formants} level={level} time={hover?.t ?? player.position} hoverHz={hover?.hz ?? null} hovering={hover !== null} selection={selection} />
  const jobLabel = (kind: string) => t(kind === 'lyrics' ? 'job.kind.lyrics' : kind === 'morae' ? 'job.kind.morae' : 'job.kind.analyze')

  return (
    <LangContext.Provider value={lang}>
      <PevenLabels.Provider value={i18n.labels(lang)}>
        <WindowModeContext.Provider value={settings.dialogWindow === 'auto' ? autoWindowMode() : settings.dialogWindow}>
          <Box sx={{ height: FULL_HEIGHT, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
            <AppHeader icon={<AppIcon size={16} />} menus={menus} />
            {picker.input}
            {comparePicker.input}
            {mobile ? (
              <MobileLayout
                editor={editor}
                editorFooter={null}
                view={<>{viewTools}{trackSelect}</>}
                tabs={[{ key: 'analysis', label: t('tab.analysis'), content: analysis }]}
                storageKey={app.key('mobilePanelPinned')}
                playBar={
                  <BottomBar kindLabel={jobLabel}>
                    <Stack direction="row" sx={{ alignItems: 'center', px: 1, py: 0.5 }}>
                      {transport}
                      <Typography variant="body2" sx={{ ml: 'auto', fontFamily: 'monospace' }}>
                        {time}
                      </Typography>
                    </Stack>
                  </BottomBar>
                }
              />
            ) : (
              <DesktopLayout
                storageKey={app.key('inspectorWidth')}
                toolbar={
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                    {transport}
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', mx: 1 }}>
                      {time}
                    </Typography>
                    <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                    {viewTools}
                    {trackSelect}
                  </Stack>
                }
                editor={editor}
                inspector={analysis}
                statusBar={
                  <StatusBar>
                    <StatusItem>{projectTracks.length > 1 ? `${name}（${projectTracks[trackIndex]?.name}）` : name || '—'}</StatusItem>
                    {clip && (
                      <StatusItem secondary>
                        {clip.sampleRate} Hz・{clip.channels.length === 1 ? 'Mono' : `${clip.channels.length} ch`}
                      </StatusItem>
                    )}
                    <StatusSpacer />
                    <JobGauge kindLabel={jobLabel} />
                  </StatusBar>
                }
              />
            )}
          </Box>
          <LyricsDialog
            open={lyricsOpen}
            onClose={() => setLyricsOpen(false)}
            model={settings.lyricsModel}
            language={settings.lyricsLanguage}
            allowCpu={settings.lyricsCpu}
            onChange={updateSettings}
            onRun={(d) => void runLyrics(d)}
          />
          <LabelsDialog
            open={labelsOpen}
            onClose={() => setLabelsOpen(false)}
            labels={labels}
            onSave={setLabels}
            onPick={(l) => {
              if (l.end > l.start) setSelection({ start: l.start, end: l.end })
              seekTo(l.start)
            }}
          />
          {lyrics && <LyricsEditDialog open={lyricsEditOpen} onClose={() => setLyricsEditOpen(false)} lyrics={lyrics} onSave={setLyrics} />}
          {addonInstall.dialog}
          <SettingsDialog open={settingsOpen} focusSignal={settingsFocus} onClose={() => setSettingsOpen(false)} settings={settings} onChange={updateSettings} />
          <AboutDialog open={dialog === 'about'} onClose={() => setDialog(null)} />
          <LicensesDialog open={dialog === 'licenses'} onClose={() => setDialog(null)} title={t('menu.licenses')} intro={t('licenses.intro')} entries={licenseEntries()} />
          <ShortcutsDialog open={dialog === 'shortcuts'} onClose={() => setDialog(null)} keymap={keymap} wheelZoom={settings.wheelZoom} />
          <UpdatePrompt build={APP_BUILD} devUpdates={settings.devUpdates} />
          <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} message={toast} />
        </WindowModeContext.Provider>
      </PevenLabels.Provider>
    </LangContext.Provider>
  )
}
