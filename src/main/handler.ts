import { shell } from 'electron'
import type { Result, UpdateCheckResult } from '@common/types'
import { ok, error } from '@common/result'
import type { Updater } from './updater'

export class Handler {
  private _updater: Updater | null = null

  setUpdater(updater: Updater): void {
    this._updater = updater
  }

  async ping(): Promise<Result<string>> {
    return ok('pong')
  }

  async openFolder(folderPath: string): Promise<Result<void>> {
    await shell.openPath(folderPath)
    return ok(undefined)
  }

  async checkForUpdates(): Promise<Result<UpdateCheckResult, string>> {
    if (!this._updater) {
      return error('Updater not initialized')
    }

    try {
      const result = await this._updater.checkForUpdates()
      return ok(result)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      return error(errorMessage)
    }
  }

  async downloadUpdate(): Promise<Result<void, string>> {
    if (!this._updater) {
      return error('Updater not initialized')
    }

    try {
      await this._updater.downloadUpdate()
      return ok(undefined)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      return error(errorMessage)
    }
  }

  async quitAndInstall(): Promise<Result<void, string>> {
    if (!this._updater) {
      return error('Updater not initialized')
    }

    try {
      this._updater.quitAndInstall()
      return ok(undefined)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      return error(errorMessage)
    }
  }
}
