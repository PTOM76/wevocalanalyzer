import { Link } from '@mui/material'
import { AboutDialog as PevenAboutDialog } from 'pevenmui'
import { formatBuild } from 'pevenmui/pwa'
import { useT } from './i18n'
import { REPOSITORY_URL } from './links'

import { app } from './appConfig'

/** 今動いている版（バージョンとコミット。例: 1.0.0 (47a7e39)） */
export const APP_BUILD = formatBuild(__APP_VERSION__, __APP_COMMIT__)

/** アプリのアイコン（public/icon.svg）。サブパスで配信されるため BASE_URL から組み立てる */
export const AppIcon = ({ size }: { size: number }) => <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={size} height={size} style={{ display: 'block' }} />

/** 「このアプリについて」: アプリ名・バージョン・作者・リポジトリ・ライセンス（WeVocalSynth と同じ形） */
export default function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  return (
    <PevenAboutDialog
      open={open}
      onClose={onClose}
      icon={<AppIcon size={56} />}
      rows={[
        // コミットまで出して、バージョン番号を上げずにデプロイした版も見分けられるようにする
        [t('about.version'), <span className="selectable">{APP_BUILD}</span>],
        [t('about.author'), app.author],
        [
          'GitHub',
          <Link className="selectable" href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
            {REPOSITORY_URL.replace('https://', '')}
          </Link>,
        ],
        [t('about.license'), t('about.licenseText')],
      ]}
    />
  )
}
