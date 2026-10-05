import type { SettingsCategory } from 'pevenmui'
import type { MessageKey } from './i18n'
import { ACTIONS } from './keymap'

/** 設定画面の分類（WeVocalSynth の分類のうち、Analyzer に要るもの） */
export type Category = 'general' | 'keys' | 'display' | 'analysis' | 'debug'
/** 並び順と親子（親のない分類と、その下のサブアイテム） */
const TREE: [Category, Category?][] = [['general'], ['keys', 'general'], ['display'], ['analysis'], ['debug']]

/** 設定の検索の対象: 分類ごとのグループ名・項目名・説明文の訳文キー。SettingsPages に項目を足したら、ここにも足す */
const INDEX: Record<Category, MessageKey[]> = {
  general: ['settings.groupUpdate', 'update.check'],
  keys: ['settings.groupMouse', 'settings.wheelZoom', 'settings.wheelZoomCtrl', 'settings.wheelZoomWheel', 'settings.groupShortcuts', ...ACTIONS.map((a) => a.label)],
  display: ['settings.groupAppearance', 'settings.theme', 'settings.uiScale', 'settings.uiScaleHelp', 'settings.language'],
  analysis: ['settings.groupF0', 'settings.f0Min', 'settings.f0Max', 'settings.f0RangeHelp', 'settings.groupFormant', 'settings.formantCeiling', 'settings.formantCeilingHelp', 'settings.groupSpec', 'settings.specWindow', 'settings.specWindowHelp'],
  debug: ['settings.groupDebug', 'settings.devUpdates', 'settings.devUpdatesHelp', 'settings.dialogWindow'],
}

/** 設定画面に渡す分類の一覧（名前と、検索の対象の訳文） */
export function settingsCategories(t: (key: MessageKey) => string): SettingsCategory<Category>[] {
  return TREE.map(([c, parent]) => ({ id: c, label: t(`settings.cat.${c}`), texts: INDEX[c].map((k) => t(k)), parent }))
}
