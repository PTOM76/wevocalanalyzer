import { useEffect, useState } from 'react'
import { Box, Button, Divider, Snackbar, Stack, Typography, useColorScheme } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCirclePlay, faFolderOpen, faPause, faPlay, faStop } from '@fortawesome/free-solid-svg-icons'
import {
  AppHeader, BottomBar, DesktopLayout, FULL_HEIGHT, JobGauge, LABELS, LicensesDialog, MobileLayout, PevenLabels, StatusBar, StatusItem, StatusSpacer,
  WindowModeContext, autoWindowMode, setUiScale, startJob, useFileDrop, useFilePicker, useMobileLayout, useShortcuts,
} from 'pevenmui'
import { UpdatePrompt, checkForUpdate, promptUpdate } from 'pevenmui/pwa'
import { configureFileAccess } from 'pevenmui/web'
import { AUDIO_ACCEPT, decodeFile, type Clip, type Range } from 'wevocal-lib'
import { ZOOM_STEP, useWaveformView } from 'wevocal-lib/react'
import { analyzeFormants, analyzePitch, analyzeSpectrogram, type Formants, type Pitch, type Spectrogram } from '../src/index'
import AboutDialog, { APP_BUILD, AppIcon } from './AboutDialog'
import AnalysisPanel from './AnalysisPanel'
import { LangContext, resolveLang, setLang, t } from './i18n'
import { resolveKeymap } from './keymap'
import { licenseEntries } from './licenses'
import LiveTime from './LiveTime'
import { appMenus } from './menus'
import SettingsDialog from './SettingsDialog'
import { useSettings } from './settings'
import ShortcutsDialog from './ShortcutsDialog'
import { usePlayer } from './usePlayer'
import ViewTools, { SmallButton } from './ViewTools'
import WaveView from './WaveView'

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
  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'about' | 'licenses' | 'shortcuts' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 設定を開いたまま、もう一度「設定」を押したら、別の窓で開いている設定画面を手前に出す
  const [settingsFocus, setSettingsFocus] = useState(0)
  const [spec, setSpec] = useState<Spectrogram | null>(null)
  const [pitch, setPitch] = useState<Pitch | null>(null)
  const [formants, setFormants] = useState<Formants | null>(null)
  // カーソルの下の時刻（右の欄に値を出す。外に出たら再生位置の値）
  const [hover, setHover] = useState<number | null>(null)
  // 選択範囲（1 つだけ）。別のファイルを開いたら外す
  const [selection, setSelection] = useState<Range | null>(null)
  const player = usePlayer(clip)
  const view = useWaveformView(player.duration, player.livePosition, player.playing, settings.follow, '', settings.wheelZoom)
  const keymap = resolveKeymap(settings.keymap)

  // 開いたら、スペクトログラム、F0、フォルマントの順に計算する（Worker で。別のファイルを開いたら中止する）。
  // 進み具合は 1 本のゲージにまとめる（重さの目安で 4 : 3 : 3 に割る）
  useEffect(() => {
    setSpec(null)
    setPitch(null)
    setFormants(null)
    setSelection(null)
    if (!clip) return
    const ac = new AbortController()
    const job = startJob('analyze', t('job.kind.analyze'), () => ac.abort())
    const part = (from: number, span: number) => ({ signal: ac.signal, onProgress: (p: number) => job.update(from + p * span) })
    void (async () => {
      setSpec(await analyzeSpectrogram(clip, part(0, 0.4)))
      setPitch(await analyzePitch(clip, part(0.4, 0.3)))
      setFormants(await analyzeFormants(clip, part(0.7, 0.3)))
    })()
      .catch((e) => !ac.signal.aborted && setError(String(e)))
      .finally(job.end)
    return () => ac.abort()
  }, [clip])

  const open = async (file: File) => {
    try {
      setError('')
      setClip(await decodeFile(file))
      setName(file.name)
    } catch (e) {
      setError(t('error.open', { message: e instanceof Error ? e.message : String(e) }))
    }
  }
  // 開く画面はフォルダを覚える。最近使用したファイルの一覧はないので記録しない
  configureFileAccess({ rememberFolder: true, startFolder: 'music', recentFiles: false, pickerMode: 'auto' })
  const picker = useFilePicker(AUDIO_ACCEPT, (f) => void open(f), t('file.audioType'))
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
  const toggleSet = (k: 'follow' | 'showPitch' | 'showFormants') => updateSettings({ [k]: !settings[k] })
  const openSettings = () => {
    setSettingsOpen(true)
    setSettingsFocus((n) => n + 1)
  }
  // 新しい版があれば、右下の通知（UpdatePrompt）からそのまま更新できる。ここでは結果だけを知らせる
  const checkUpdate = () =>
    void checkForUpdate().then((r) => {
      if (r.kind === 'found') return promptUpdate(r.build)
      const l = LABELS[lang]
      setToast({ latest: l.updateLatest, unsupported: l.updateUnsupported, failed: l.updateFailed }[r.kind])
    })

  const has = !!clip
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
  })

  const menus = appMenus(
    {
      keymap, wheelZoom: settings.wheelZoom, hasClip: has, hasSelection: !!selection, playing: player.playing, zoomed: view.zoomed, canZoomIn: view.canZoomIn,
      follow: settings.follow, showPitch: settings.showPitch, showFormants: settings.showFormants,
      open: picker.open, showSettings: openSettings, togglePitch: () => toggleSet('showPitch'), toggleFormants: () => toggleSet('showFormants'),
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
    </>
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
      showPitch={settings.showPitch}
      onShowPitchChange={(showPitch) => updateSettings({ showPitch })}
      showFormants={settings.showFormants}
      onShowFormantsChange={(showFormants) => updateSettings({ showFormants })}
    />
  )
  const editor = clip ? (
    <WaveView
      clip={clip}
      spec={spec}
      pitch={pitch}
      formants={formants}
      showPitch={settings.showPitch}
      showFormants={settings.showFormants}
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
  const analysis = <AnalysisPanel pitch={pitch} formants={formants} time={hover ?? player.position} hovering={hover !== null} selection={selection} />
  const jobLabel = () => t('job.kind.analyze')

  return (
    <LangContext.Provider value={lang}>
      <PevenLabels.Provider value={LABELS[lang]}>
        <WindowModeContext.Provider value={settings.dialogWindow === 'auto' ? autoWindowMode() : settings.dialogWindow}>
          <Box sx={{ height: FULL_HEIGHT, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
            <AppHeader title="WeVocalAnalyzer" icon={<AppIcon size={16} />} menus={menus} />
            {picker.input}
            {mobile ? (
              <MobileLayout
                editor={editor}
                editorFooter={null}
                view={viewTools}
                tabs={[{ key: 'analysis', label: t('tab.analysis'), content: analysis }]}
                storageKey="wevocalanalyzer.mobilePanelPinned"
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
                storageKey="wevocalanalyzer.inspectorWidth"
                toolbar={
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                    {transport}
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', mx: 1 }}>
                      {time}
                    </Typography>
                    <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                    {viewTools}
                  </Stack>
                }
                editor={editor}
                inspector={analysis}
                statusBar={
                  <StatusBar>
                    <StatusItem>{name || '—'}</StatusItem>
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
