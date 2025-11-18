import { ipcRenderer } from 'electron'
import { Connection } from '../common/connection'
import { BackendListenerAPI, RendererBackendAPI, RendererMainAPI, AppEvent } from '../common/types'
import logger from './logger'

export class Server {
  private _backendConnectionPromise?: Promise<void>
  private _backendConnection: Connection | null = null

  public readonly mainAPI: RendererMainAPI = {
    ping: (...args) => ipcRenderer.invoke('ping', ...args),
    openFolder: (...args) => ipcRenderer.invoke('openFolder', ...args),
    checkForUpdates: (...args) => ipcRenderer.invoke('checkForUpdates', ...args),
    downloadUpdate: (...args) => ipcRenderer.invoke('downloadUpdate', ...args),
    quitAndInstall: (...args) => ipcRenderer.invoke('quitAndInstall', ...args)
  }

  public readonly backendAPI: RendererBackendAPI & BackendListenerAPI = {
    ping: (...args) => this._invoke('ping', ...args),
    getSetting: (...args) => this._invoke('getSetting', ...args),
    setSetting: (...args) => this._invoke('setSetting', ...args),
    clearSetting: (...args) => this._invoke('clearSetting', ...args),
    getDatabasePath: (...args) => this._invoke('getDatabasePath', ...args),
    getLogPath: (...args) => this._invoke('getLogPath', ...args),
    streamAIText: (...args) => this._invoke('streamAIText', ...args),
    abortAIText: (...args) => this._invoke('abortAIText', ...args),
    getAIModels: (...args) => this._invoke('getAIModels', ...args),
    testAIProviderConnection: (...args) => this._invoke('testAIProviderConnection', ...args),
    // AI Settings v2 APIs
    getAISettingsV2: (...args) => this._invoke('getAISettingsV2', ...args),
    saveAISettingsV2: (...args) => this._invoke('saveAISettingsV2', ...args),
    // Provider Configuration APIs
    getProviderConfigurations: (...args) => this._invoke('getProviderConfigurations', ...args),
    getProviderConfiguration: (...args) => this._invoke('getProviderConfiguration', ...args),
    createProviderConfiguration: (...args) => this._invoke('createProviderConfiguration', ...args),
    updateProviderConfiguration: (...args) => this._invoke('updateProviderConfiguration', ...args),
    deleteProviderConfiguration: (...args) => this._invoke('deleteProviderConfiguration', ...args),
    // Model Management APIs
    addModelToConfiguration: (...args) => this._invoke('addModelToConfiguration', ...args),
    updateModelInConfiguration: (...args) => this._invoke('updateModelInConfiguration', ...args),
    deleteModelFromConfiguration: (...args) => this._invoke('deleteModelFromConfiguration', ...args),
    refreshModelsFromAPI: (...args) => this._invoke('refreshModelsFromAPI', ...args),
    // MCP Server Management
    listMCPServers: (...args) => this._invoke('listMCPServers', ...args),
    addMCPServer: (...args) => this._invoke('addMCPServer', ...args),
    updateMCPServer: (...args) => this._invoke('updateMCPServer', ...args),
    removeMCPServer: (...args) => this._invoke('removeMCPServer', ...args),
    getMCPResources: (...args) => this._invoke('getMCPResources', ...args),
    getMCPTools: (...args) => this._invoke('getMCPTools', ...args),
    getMCPPrompts: (...args) => this._invoke('getMCPPrompts', ...args),
    callMCPTool: (...args) => this._invoke('callMCPTool', ...args),
    // Proxy settings
    getProxySettings: (...args) => this._invoke('getProxySettings', ...args),
    setProxySettings: (...args) => this._invoke('setProxySettings', ...args),
    getSystemProxySettings: (...args) => this._invoke('getSystemProxySettings', ...args),
    // Certificate settings
    getCertificateSettings: (...args) => this._invoke('getCertificateSettings', ...args),
    setCertificateSettings: (...args) => this._invoke('setCertificateSettings', ...args),
    getSystemCertificateSettings: (...args) => this._invoke('getSystemCertificateSettings', ...args),
    // Connection tests
    testProxyConnection: (...args) => this._invoke('testProxyConnection', ...args),
    testCertificateConnection: (...args) => this._invoke('testCertificateConnection', ...args),
    testCombinedConnection: (...args) => this._invoke('testCombinedConnection', ...args),
    testFullConnection: (...args) => this._invoke('testFullConnection', ...args),
    // Chat Session Management
    createChatSession: (...args) => this._invoke('createChatSession', ...args),
    getChatSession: (...args) => this._invoke('getChatSession', ...args),
    listChatSessions: (...args) => this._invoke('listChatSessions', ...args),
    updateChatSession: (...args) => this._invoke('updateChatSession', ...args),
    deleteChatSession: (...args) => this._invoke('deleteChatSession', ...args),
    searchChatSessions: (...args) => this._invoke('searchChatSessions', ...args),
    addChatMessage: (...args) => this._invoke('addChatMessage', ...args),
    recordToolInvocationResult: (...args) => this._invoke('recordToolInvocationResult', ...args),
    deleteMessagesAfter: (...args) => this._invoke('deleteMessagesAfter', ...args),
    getLastSessionId: (...args) => this._invoke('getLastSessionId', ...args),
    setLastSessionId: (...args) => this._invoke('setLastSessionId', ...args),
    // Compression APIs
    getCompressionSettings: (...args) => this._invoke('getCompressionSettings', ...args),
    setCompressionSettings: (...args) => this._invoke('setCompressionSettings', ...args),
    getTokenUsage: (...args) => this._invoke('getTokenUsage', ...args),
    checkCompressionNeeded: (...args) => this._invoke('checkCompressionNeeded', ...args),
    getCompressionPreview: (...args) => this._invoke('getCompressionPreview', ...args),
    compressConversation: (...args) => this._invoke('compressConversation', ...args),
    getCompressionSummaries: (...args) => this._invoke('getCompressionSummaries', ...args),
    onEvent: (channel: string, callback: (appEvent: AppEvent) => void) => {
      this._backendConnection!.onEvent(channel, callback)
    },
    offEvent: (channel: string) => {
      this._backendConnection!.offEvent(channel)
    }
  }

  private _invoke(channel: string, ...args) {
    return this._backendConnection!.invoke(channel, ...args)
  }

  async connectBackend(): Promise<void> {
    if (this._backendConnectionPromise) {
      return this._backendConnectionPromise
    }

    this._backendConnectionPromise = new Promise<void>((resolve) => {
      ipcRenderer.on('backendConnected', (event) => {
        const [port] = event.ports
        this._backendConnection = new Connection(port)

        logger.info('Backend connection established')
        resolve()
      })

      // attempt to reconnect when backend exited
      ipcRenderer.on('backendExited', () => {
        ipcRenderer.send('connectBackend')
      })

      logger.info('Connecting to backend...')
      ipcRenderer.send('connectBackend')
    })

    return this._backendConnectionPromise
  }
}
