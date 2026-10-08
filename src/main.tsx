import React from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
createRoot(document.getElementById('root')!).render(
  <ConfigProvider
    button={{ autoInsertSpace: false }}
    locale={zhCN}
    theme={{
      token: {
        colorPrimary: '#4e6d82',
        borderRadius: 9,
        colorText: '#30384b',
        colorTextSecondary: '#82919b',
        colorBgContainer: '#f9fbfc',
        fontFamily:
          'Inter, "Noto Sans CJK SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 13,
        controlHeight: 34,
        colorBorder: '#d7dfe3'
      },
      components: { Button: { primaryShadow: 'none' }, Modal: { borderRadiusLG: 16 } }
    }}
  >
    <AntApp>
      <App />
    </AntApp>
  </ConfigProvider>
)
