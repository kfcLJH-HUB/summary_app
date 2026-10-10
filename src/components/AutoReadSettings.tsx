export function AutoReadSettings({ enabled, onChange }: {
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  return <div className="settings-group">
    <div className="settings-group-heading"><h3>自动读取会话</h3><p>开启后，启动时读取一次，此后每 5 分钟读取已勾选的 AI 工具。</p></div>
    <label className="toggle-field"><input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked)} /><span>自动读取会话</span></label>
    <span className="settings-hint">保存后生效。关闭后只在手动操作时读取；已开始的读取会完成。若开启自动生成日报，到设定时间仍会读取当天会话用于生成。</span>
  </div>
}
