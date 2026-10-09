// 右の欄の 1 行の値
import { Box, Stack, Typography } from '@mui/material'

/** 1 行の値（名前と数値。色の印があればその前に出す） */
export function Value({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, fontSize: 13 }}>
      {color && <Box sx={{ width: 10, height: 10, bgcolor: color, borderRadius: 0.5 }} />}
      <Typography sx={{ fontSize: 13, color: 'text.secondary', minWidth: 72 }}>{label}</Typography>
      <Typography className="selectable" sx={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Stack>
  )
}
