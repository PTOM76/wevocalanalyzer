import { useState } from 'react'
import { Box, Button, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFolderOpen, faPause, faPlay, faStop } from '@fortawesome/free-solid-svg-icons'
import {
  AboutDialog, AppHeader, BottomBar, DesktopLayout, FULL_HEIGHT, LABELS, MobileLayout, PevenLabels, StatusBar, StatusItem, StatusSpacer,
  JobGauge, useFileDrop, useFilePicker, useMobileLayout, type MenuGroup,
} from 'pevenmui'
import { AUDIO_ACCEPT, decodeFile, type Clip } from 'wevocal-lib'
import { useWaveformView } from 'wevocal-lib/react'
import { LangContext, resolveLang, setLang, t } from './i18n'
import { usePlayer } from './usePlayer'
import WaveView from './WaveView'

const AppIcon = ({ size }: { size: number }) => <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={size} height={size} style={{ display: 'block' }} />

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(2).padStart(5, '0')}`

/** 画面の組み立て。配置は PevenMUI、波形は wevocal-lib（WeVocalSynth と同じ部品） */
export default function App() {
  const lang = resolveLang('auto')
  setLang(lang)
  const mobile = useMobileLayout()
  const [clip, setClip] = useState<Clip | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [about, setAbout] = useState(false)
  const player = usePlayer(clip)
  const view = useWaveformView(player.duration, player.livePosition, player.playing)

  const open = async (file: File) => {
    try {
      setError('')
      setClip(await decodeFile(file))
      setName(file.name)
    } catch (e) {
      setError(t('error.open', { message: e instanceof Error ? e.message : String(e) }))
    }
  }
  const picker = useFilePicker(AUDIO_ACCEPT, (f) => void open(f))
  useFileDrop((f) => void open(f))

  const menus: MenuGroup[] = [
    { label: t('menu.file'), accessKey: 'F', entries: [{ label: t('menu.open'), shortcut: 'Ctrl+O', onClick: picker.open }] },
    { label: t('menu.help'), accessKey: 'H', entries: [{ label: t('menu.about'), onClick: () => setAbout(true) }] },
  ]

  const transport = (
    <Stack direction="row" sx={{ alignItems: 'center' }}>
      <Tooltip title={t(player.playing ? 'play.pause' : 'play.play')}>
        <span>
          <IconButton color="primary" disabled={!clip} onClick={player.toggle}>
            <FontAwesomeIcon icon={player.playing ? faPause : faPlay} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('play.stop')}>
        <span>
          <IconButton disabled={!clip} onClick={player.stop}>
            <FontAwesomeIcon icon={faStop} />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  )

  const editor = clip ? (
    <WaveView clip={clip} view={view} position={player.position} playing={player.playing} livePosition={player.livePosition} onSeek={player.seek} />
  ) : (
    <Stack sx={{ height: '100%', alignItems: 'center', justifyContent: 'center', gap: 2, p: 2 }}>
      <Typography sx={{ color: 'text.secondary' }}>{t('empty.hint')}</Typography>
      <Button variant="contained" startIcon={<FontAwesomeIcon icon={faFolderOpen} />} onClick={picker.open}>
        {t('empty.open')}
      </Button>
      {error && <Typography sx={{ color: 'error.main', fontSize: 13 }}>{error}</Typography>}
    </Stack>
  )
  const analysis = <Typography sx={{ p: 2, fontSize: 13, color: 'text.secondary' }}>{t('analysis.soon')}</Typography>
  const jobLabel = () => t('job.kind.analyze')

  return (
    <LangContext.Provider value={lang}>
      <PevenLabels.Provider value={LABELS[lang]}>
        <Box sx={{ height: FULL_HEIGHT, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
          <AppHeader title="WeVocalAnalyzer" icon={<AppIcon size={16} />} menus={menus} />
          {picker.input}
          {mobile ? (
            <MobileLayout
              editor={editor}
              editorFooter={null}
              view={null}
              tabs={[{ key: 'analysis', label: t('tab.analysis'), content: analysis }]}
              storageKey="wevocalanalyzer.mobilePanelPinned"
              playBar={
                <BottomBar kindLabel={jobLabel}>
                  <Stack direction="row" sx={{ alignItems: 'center', px: 1, py: 0.5 }}>
                    {transport}
                    <Typography variant="body2" sx={{ ml: 'auto', fontFamily: 'monospace' }}>{fmt(player.position)}</Typography>
                  </Stack>
                </BottomBar>
              }
            />
          ) : (
            <DesktopLayout
              storageKey="wevocalanalyzer.inspectorWidth"
              toolbar={<Box sx={{ px: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>{transport}</Box>}
              editor={editor}
              inspector={analysis}
              statusBar={
                <StatusBar>
                  <StatusItem>{name || '—'}</StatusItem>
                  {clip && (
                    <StatusItem secondary>
                      {clip.sampleRate} Hz・{clip.channels.length === 1 ? 'Mono' : `${clip.channels.length} ch`}・{fmt(player.duration)}
                    </StatusItem>
                  )}
                  <StatusSpacer />
                  <JobGauge kindLabel={jobLabel} />
                </StatusBar>
              }
            />
          )}
          <AboutDialog
            open={about}
            onClose={() => setAbout(false)}
            icon={<AppIcon size={56} />}
            name="WeVocalAnalyzer"
            rows={[[t('about.version'), `${__APP_VERSION__} (${__APP_COMMIT__})`]]}
          />
        </Box>
      </PevenLabels.Provider>
    </LangContext.Provider>
  )
}
