import type { LicenseEntry } from 'pevenmui'
import { t } from './i18n'
import { REPOSITORY_URL } from './links'
import { app } from './appConfig'

/** ヘルプの「ライセンス情報」に出す、使っている部品の一覧（WeVocalSynth の src/licenses.ts と同じ形）。部品を足したら、ここにも足す */
export const licenseEntries = (): LicenseEntry[] => [
  { name: app.name, license: 'MIT', url: REPOSITORY_URL, note: t('licenses.app') },
  { name: 'PevenMUI', license: 'MIT', url: 'https://github.com/PTOM76/pevenmui', note: t('licenses.ui') },
  { name: 'WeVocalLib', license: 'MIT', url: 'https://github.com/PTOM76/wevocal-lib', note: t('licenses.audio') },
  { name: 'React', license: 'MIT', url: 'https://github.com/facebook/react', note: t('licenses.ui') },
  { name: 'MUI (Material UI)', license: 'MIT', url: 'https://github.com/mui/material-ui', note: t('licenses.ui') },
  { name: 'Emotion', license: 'MIT', url: 'https://github.com/emotion-js/emotion', note: t('licenses.style') },
  { name: 'Font Awesome Free', license: 'CC BY 4.0 / MIT', url: 'https://fontawesome.com/license/free', note: t('licenses.icons') },
  { name: 'Roboto', license: 'OFL-1.1', url: 'https://fontsource.org/fonts/roboto', note: t('licenses.font') },
  { name: 'Transformers.js', license: 'Apache-2.0', url: 'https://github.com/huggingface/transformers.js', note: t('licenses.lyrics') },
  { name: 'ONNX Runtime Web', license: 'MIT', url: 'https://github.com/microsoft/onnxruntime', note: t('licenses.ort') },
  { name: 'Whisper', license: 'MIT', url: 'https://github.com/openai/whisper', note: t('licenses.whisper') },
  { name: 'Workbox', license: 'MIT', url: 'https://github.com/GoogleChrome/workbox', note: t('licenses.pwa') },
]
