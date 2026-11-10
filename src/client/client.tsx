/* Browser loader entry. React and Connection come from the DSH client runtime. */
;(
  window as unknown as { __ModuleLoader__: import('./host.js').ModuleLoader }
).__ModuleLoader__.load({
  id: '@goldenpigeon/dsh-eu4-indexer',
  factory(require) {
    type PageProps = import('./host.js').PageProps
    type ClientContext = import('./host.js').ClientContext
    type Form = import('./host.js').Form
    type TextField = import('./host.js').TextField
    type CheckField = import('./host.js').CheckField
    type Api = import('../contracts.js').Api
    type ManagementRequest = import('../contracts.js').ManagementRequest
    type ManagementResponses = import('../contracts.js').ManagementResponses
    type ServiceState = import('../contracts.js').ServiceState
    type Inspection = import('../contracts.js').Inspection
    type Choices = {
      game: Form['game']
      workshop: import('../contracts.js').WorkshopMod[]
      playsets: import('../contracts.js').Playset[]
    }
    const errorMessage = (error: unknown) =>
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
        ? error.message
        : String(error)
    const React = require('react')
    const { useState, useEffect } = React
    const zh = {
      title: '游戏脚本索引',
      subtitle: 'EU4 / HOI4 · 本地解析与查询 · 会话独立选择数据库',
      indexes: '索引与会话',
      build: '创建索引',
      tasks: '后台任务',
      engine: '引擎与设置',
      ready: '引擎可用',
      missing: '引擎未就绪',
      refresh: '刷新索引',
      inspect: '详情',
      remove: '移除',
      name: '索引名称',
      game: '游戏',
      gameDir: '游戏安装目录（留空自动检测）',
      configDir: '规则目录（留空使用随包规则）',
      mods: '手动模组路径，每行一个，按加载顺序排列',
      workshop: 'Workshop 模组',
      playset: '启动器模组集',
      load: '读取模组选择',
      detect: '预览解析结果',
      create: '创建 / 重建索引',
      languages: '本地化语言，逗号分隔，留空全部',
      auto: '读取启动器当前启用模组',
      skip: '仅索引核心类型',
      noFts: '禁用全文检索',
      advanced: '高级选项',
      noIndexes:
        '还没有索引。选择游戏与模组，使用随包规则创建索引；也可以导入已有数据库。',
      noTasks: '暂无后台任务',
      noSessions: '暂无已加载会话。在 DSH 中打开聊天后即可绑定。',
      chooseSession: '请选择会话',
      session: '会话',
      unbind: '解除绑定',
      previous: '上一页',
      next: '下一页',
      bind: '绑定默认索引',
      binding: '会话默认索引',
      import: '导入已有数据库',
      path: '数据库文件的绝对路径',
      importAction: '注册数据库',
      cancel: '取消',
      close: '关闭',
      external: '外部引擎路径（留空使用随包引擎）',
      save: '检查并保存',
      running: '进行中',
      queued: '排队中',
      succeeded: '已完成',
      failed: '失败',
      cancelled: '已取消',
      cancelling: '正在取消',
      interrupted: '已中断',
      removeConfirm: '移除该索引的注册记录？',
      deleteFile: '同时删除插件管理的数据库文件',
      confirm: '确认移除',
      error: '操作失败',
      details: '索引详情',
      available: '可用规则',
      clear: '清除',
      default: '自动 / 当前默认',
      rulesHint: '规则随引擎提供并随插件更新；游戏或模组更新后刷新索引即可。',
      retained: '重建会创建并验证新数据库，完成后切换；失败或取消保留原索引。',
      engineHint:
        '引擎和游戏规则随插件自动安装和更新。外部引擎必须支持管理 API 1。',
      loading: '正在读取…',
      taskId: '任务',
      sourceCount: '来源',
      parseErrors: '解析错误',
      language: '模型根据当前对话自动选择中英文技能，与界面语言无关。',
      unload: '宿主重启会将未完成任务标为中断，重新执行即可。',
      manual: '不使用模组集',
      choose: '请选择索引',
      report: '执行结果',
      raw: '原始诊断',
      deleteHint: '正被会话选用或正在构建的索引不能移除。',
      models:
        '在聊天中直接提问即可使用游戏查询工具；每个会话的数据库选择互不影响。',
      selectAll: '全选',
      deselect: '清空选择',
      started: '任务已提交',
      inspectHint: '解析错误不会中止整个索引；请检查文件与行号。',
      enginePath: '当前引擎',
      home: '数据目录',
      noWorkshop: '没有发现 Workshop 模组',
      noPlaysets: '没有发现启动器模组集',
      result: '预览结果',
      bytes: '已下载',
      completed: '处理文件',
      replacing: '同名索引会发布新的数据库版本。',
      toggle: '查看 / 收起',
      renameHint: '名称支持字母、数字、点、下划线与连字符；建议带上游戏名。',
    }
    const en = {
      title: 'Game script indexes',
      subtitle:
        'EU4 / HOI4 · Local indexing and queries · Independent session selection',
      indexes: 'Indexes & sessions',
      build: 'Build index',
      tasks: 'Background tasks',
      engine: 'Engine & settings',
      ready: 'Engine ready',
      missing: 'Engine unavailable',
      refresh: 'Refresh',
      inspect: 'Details',
      remove: 'Remove',
      name: 'Index name',
      game: 'Game',
      gameDir: 'Game directory (blank: auto-detect)',
      configDir: 'Rules directory (blank: bundled rules)',
      mods: 'Manual mod paths, one per line, in load order',
      workshop: 'Workshop mods',
      playset: 'Launcher playset',
      load: 'Load mod choices',
      detect: 'Preview resolved sources',
      create: 'Build / rebuild index',
      languages: 'Localisation languages, comma-separated; blank for all',
      auto: 'Use currently enabled launcher mods',
      skip: 'Core entity types only',
      noFts: 'Disable full-text search',
      advanced: 'Advanced options',
      noIndexes:
        'No indexes yet. Choose a game and mods to build an index using bundled rules, or import an existing database.',
      noTasks: 'No background tasks',
      noSessions: 'No loaded sessions. Open a DSH chat to bind an index.',
      chooseSession: 'Choose a session',
      session: 'Session',
      unbind: 'Unbind',
      previous: 'Previous',
      next: 'Next',
      bind: 'Set session default',
      binding: 'Session default index',
      import: 'Import an existing database',
      path: 'Absolute database file path',
      importAction: 'Register database',
      cancel: 'Cancel',
      close: 'Close',
      external: 'External engine path (blank: packaged engine)',
      save: 'Check and save',
      running: 'Running',
      queued: 'Queued',
      succeeded: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled',
      cancelling: 'Cancelling',
      interrupted: 'Interrupted',
      removeConfirm: 'Remove this index registration?',
      deleteFile: 'Also delete the plugin-managed database file',
      confirm: 'Confirm removal',
      error: 'Operation failed',
      details: 'Index details',
      available: 'Available rules',
      clear: 'Clear',
      default: 'Auto / current default',
      rulesHint:
        'Rules are bundled with the engine and updated with the plugin. Refresh indexes after a game or mod update.',
      retained:
        'A rebuild validates a new database before switching. Failure or cancellation retains the previous index.',
      engineHint:
        'The engine and game rules are installed and updated with the plugin. External engines must support management API 1.',
      loading: 'Loading…',
      taskId: 'Task',
      sourceCount: 'sources',
      parseErrors: 'parse errors',
      language:
        'The model chooses Chinese or English skills from the conversation, independently of the UI language.',
      unload:
        'A host restart marks unfinished tasks interrupted. Submit them again to retry.',
      deleteHint:
        'An index selected by a session or being built cannot be removed.',
      models:
        'Ask game questions in chat. Each session has an independent database selection.',
      selectAll: 'Select all',
      deselect: 'Clear selection',
      started: 'Task submitted',
      inspectHint:
        'Parse errors do not stop the entire index. Check the reported files and lines.',
      enginePath: 'Current engine',
      home: 'Data directory',
      noWorkshop: 'No Workshop mods found',
      noPlaysets: 'No launcher playsets found',
      result: 'Resolved sources',
      bytes: 'Downloaded',
      completed: 'Files processed',
      replacing: 'An existing name publishes a new database version.',
      toggle: 'Expand / collapse',
      renameHint:
        'Use letters, digits, dots, underscores or hyphens. Include the game name to avoid collisions.',
    }
    const CSS = `.e4{font:13px/1.55 system-ui,sans-serif;color:var(--dsw-alias-label-primary,inherit);max-width:1080px;margin:auto;padding:20px}.e4 *{box-sizing:border-box}.e4 header{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:20px}.e4 h2{font-size:23px;letter-spacing:-.6px;margin:0 0 4px}.e4 small,.e4 .hint{color:var(--dsw-alias-label-secondary,#888);font-size:12px}.e4 nav{display:flex;gap:6px;border-bottom:1px solid #8883;margin:0 0 20px;padding-bottom:12px;flex-wrap:wrap}.e4 button{font:inherit;padding:7px 12px;border:1px solid #8884;border-radius:8px;background:transparent;color:inherit;cursor:pointer}.e4 button:hover{background:#8881}.e4 button:disabled{opacity:.45;cursor:default}.e4 button.primary,.e4 nav button[aria-selected=true]{background:#4168da;color:white;border-color:#4168da}.e4 button.danger{color:#dc6060}.e4 .card{padding:18px;border:1px solid #8883;border-radius:12px;margin-bottom:14px}.e4 .row{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.e4 .spread{justify-content:space-between}.e4 .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.e4 label{display:grid;gap:5px;margin:10px 0}.e4 label.check{display:flex;align-items:center;gap:8px;margin:8px 0}.e4 input:not([type=checkbox]),.e4 select,.e4 textarea{font:inherit;width:100%;border:1px solid #8884;border-radius:7px;padding:8px 10px;background:var(--dsw-alias-settings-card-fill,transparent);color:inherit}.e4 textarea{min-height:104px;resize:vertical}.e4 input[type=checkbox]{accent-color:#4168da}.e4 pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;max-height:330px;overflow:auto;padding:12px;background:#8881;border-radius:8px}.e4 .badge{font-size:11px;border-radius:20px;padding:4px 9px;background:#8882}.e4 .ok{color:#339b69;background:#339b6917}.e4 .bad{color:#d36b5b;background:#d36b5b17}.e4 .error{border:1px solid #d36b5b66;background:#d36b5b14;padding:12px;border-radius:10px;margin-bottom:15px;white-space:pre-wrap}.e4 progress{width:100%;height:6px;accent-color:#4168da}.e4 .choices{max-height:220px;overflow:auto}.e4 h3{font-size:15px;margin:0 0 10px}.e4 .empty{padding:35px 15px;text-align:center;color:#888}.e4 .mono{font:11px/1.5 ui-monospace,monospace;overflow-wrap:anywhere}.e4 .buttons{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}.e4 details{margin-top:12px}.e4 summary{cursor:pointer}.e4 .notice{border-left:3px solid #4168da;padding:9px 12px;background:#4168da0c;margin:14px 0}.e4 .index-title{font-weight:650;font-size:14px}.e4 fieldset{border:0;padding:0;margin:0}.e4 .task-log{max-height:180px}.e4 .index-meta{display:flex;gap:12px;margin:4px 0 10px;color:#888;font-size:11px}@media(max-width:600px){.e4{padding:14px}.e4 header{align-items:flex-start;flex-direction:column}.e4 .card{padding:13px}}`
    function Page({ api, t, summary }: PageProps) {
      const [state, setState] = useState<ServiceState | null>(null),
        [tab, setTab] = useState('indexes'),
        [error, setError] = useState(''),
        [busy, setBusy] = useState(false)
      const [form, setForm] = useState<Form>({
        game: 'eu4',
        name: 'eu4-vanilla',
        gameDir: '',
        configDir: '',
        mods: '',
        workshopIds: [],
        playset: '',
        languages: '',
        autoMods: false,
        skipGeneric: false,
        noFts: false,
      })
      const [choices, setChoices] = useState<Choices | null>(null),
        [preview, setPreview] = useState<{
          input: string
          value: unknown
        } | null>(null),
        [detail, setDetail] = useState<Inspection | null>(null),
        [removing, setRemoving] = useState(''),
        [deleteFile, setDeleteFile] = useState(false)
      const [importing, setImporting] = useState(false),
        [importName, setImportName] = useState(''),
        [importPath, setImportPath] = useState(''),
        [external, setExternal] = useState(''),
        [session, setSession] = useState(''),
        [selected, setSelected] = useState('')
      const update = <K extends keyof Form>(key: K, value: Form[K]) =>
        setForm((f) => ({ ...f, [key]: value }))
      const reload = async (signal?: AbortSignal) => {
        const value = await api({ operation: 'state' }, signal)
        setState(value)
        return value
      }
      useEffect(() => {
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | undefined
        const poll = async () => {
          try {
            await reload(controller.signal)
          } catch (e) {
            if (!controller.signal.aborted) setError(errorMessage(e))
          } finally {
            if (!controller.signal.aborted) timer = setTimeout(poll, 1800)
          }
        }
        poll()
        return () => {
          controller.abort()
          clearTimeout(timer)
        }
      }, [])
      const act = async <K extends keyof ManagementResponses>(
        request: ManagementRequest & {
          operation: K
        },
        callback?: (value: ManagementResponses[K]) => void,
      ) => {
        setError('')
        setBusy(true)
        try {
          const result = await api(request)
          if (callback) callback(result)
          await reload()
          return result
        } catch (e) {
          setError(errorMessage(e))
        } finally {
          setBusy(false)
        }
      }
      const button = (
        label: import('react').ReactNode,
        onClick: import('react').MouseEventHandler<HTMLButtonElement>,
        kind = '',
        disabled = false,
      ) => (
        <button
          type="button"
          className={kind}
          onClick={onClick}
          disabled={busy || disabled}
        >
          {label}
        </button>
      )
      const field = (
        key: TextField,
        label: keyof typeof zh,
        props: import('react').InputHTMLAttributes<HTMLInputElement> = {},
      ) => (
        <label>
          {t(label)}
          <input
            value={form[key]}
            onChange={(e) => update(key, e.target.value)}
            {...props}
          />
        </label>
      )
      const check = (key: CheckField, label: keyof typeof zh) => (
        <label className="check">
          <input
            type="checkbox"
            checked={form[key]}
            onChange={(e) => update(key, e.target.checked)}
          />
          {t(label)}
        </label>
      )
      const buildRequest = <K extends 'index' | 'detect'>(
        operation: K,
      ): ManagementRequest & {
        operation: K
      } => ({
        operation,
        game: form.game,
        name: form.name,
        ...(form.gameDir.trim() ? { gameDir: form.gameDir.trim() } : {}),
        ...(form.configDir.trim() ? { configDir: form.configDir.trim() } : {}),
        mods: form.mods
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        workshopIds: form.workshopIds,
        ...(form.playset ? { playset: form.playset } : {}),
        languages: form.languages
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        autoMods: form.autoMods,
        skipGeneric: form.skipGeneric,
        noFts: form.noFts,
      })
      const indexes = state?.registry.databases ?? [],
        jobs = state?.tasks ?? []
      if (summary)
        return (
          <span>
            {state
              ? state.engine.ready
                ? `${t('ready')} · ${indexes.length} ${t('indexes')}`
                : t('missing')
              : t('loading')}
          </span>
        )
      return (
        <div className="e4">
          <style>{CSS}</style>
          <header>
            <div>
              <h2>{t('title')}</h2>
              <small>{t('subtitle')}</small>
            </div>
            <span className={`badge ${state?.engine.ready ? 'ok' : 'bad'}`}>
              {state?.engine.ready ? t('ready') : t('missing')}
            </span>
          </header>
          {error ? (
            <div className="error" role="alert">
              <strong>{t('error') + ' · '}</strong>
              {error}
              {button('×', () => setError(''))}
            </div>
          ) : null}
          <nav role="tablist">
            {['indexes', 'build', 'tasks', 'engine'].map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {t(id)}
                {id === 'tasks' &&
                jobs.some((j) => ['running', 'queued'].includes(j.state))
                  ? ' •'
                  : ''}
              </button>
            ))}
          </nav>
          {!state ? <div className="empty">{t('loading')}</div> : null}
          {tab === 'indexes' ? (
            <section>
              <div className="notice">{t('models')}</div>
              {indexes.length ? (
                indexes.map((db) => (
                  <article className="card" key={db.name}>
                    <div className="row spread">
                      <div>
                        <span className="index-title">{db.name}</span>{' '}
                        <span className="badge">{db.game.toUpperCase()}</span>
                      </div>
                      <div className="row">
                        {button(t('inspect'), () =>
                          act(
                            { operation: 'inspect', name: db.name },
                            setDetail,
                          ),
                        )}
                        {button(t('refresh'), () =>
                          act(
                            {
                              operation: 'refresh',
                              name: db.name,
                              game: db.game,
                            },
                            () => setTab('tasks'),
                          ),
                        )}
                        {button(
                          t('remove'),
                          () => {
                            setRemoving(db.name)
                            setDeleteFile(false)
                          },
                          'danger',
                        )}
                      </div>
                    </div>
                    <div className="index-meta">
                      <span>{`${db.sources} ${t('sourceCount')}`}</span>
                      <span>{new Date(db.indexedAt).toLocaleString()}</span>
                    </div>
                    <div className="mono">{db.path}</div>
                    {removing === db.name ? (
                      <div className="notice">
                        {t('removeConfirm')}
                        <p className="hint">{t('deleteHint')}</p>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={deleteFile}
                            onChange={(e) => setDeleteFile(e.target.checked)}
                          />
                          {t('deleteFile')}
                        </label>
                        <div className="buttons">
                          {button(
                            t('confirm'),
                            () =>
                              act(
                                {
                                  operation: 'remove',
                                  name: db.name,
                                  deleteFile,
                                },
                                () => setRemoving(''),
                              ),
                            'danger',
                          )}
                          {button(t('cancel'), () => setRemoving(''))}
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="empty">{t('noIndexes')}</div>
              )}
              <div className="card">
                <h3>{t('binding')}</h3>
                <div className="grid">
                  <label>
                    {t('session')}
                    <select
                      value={session}
                      onChange={(e) => {
                        setSession(e.target.value)
                        setSelected(state?.bindings[e.target.value] ?? '')
                      }}
                    >
                      <option value="">
                        {t(
                          state?.sessions?.length
                            ? 'chooseSession'
                            : 'noSessions',
                        )}
                      </option>
                      {(state?.sessions ?? []).map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('indexes')}
                    <select
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      <option value="">{t('choose')}</option>
                      {indexes.map((db) => (
                        <option value={db.name} key={db.name}>
                          {db.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {button(
                  t('bind'),
                  () =>
                    act({
                      operation: 'bind',
                      sessionId: session,
                      name: selected,
                    }),
                  'primary',
                  !session || !selected,
                )}
                {button(
                  t('unbind'),
                  () => act({ operation: 'unbind', sessionId: session }),
                  '',
                  !session,
                )}
              </div>
              {button(t('import'), () => setImporting(!importing))}
              {importing ? (
                <div className="card">
                  <label>
                    {t('name')}
                    <input
                      value={importName}
                      onChange={(e) => setImportName(e.target.value)}
                    />
                  </label>
                  <label>
                    {t('path')}
                    <input
                      value={importPath}
                      onChange={(e) => setImportPath(e.target.value)}
                    />
                  </label>
                  {button(
                    t('importAction'),
                    () =>
                      act(
                        {
                          operation: 'register',
                          name: importName,
                          path: importPath,
                        },
                        () => setImporting(false),
                      ),
                    'primary',
                    !importName || !importPath,
                  )}
                </div>
              ) : null}
              {detail ? (
                <div className="card">
                  <div className="row spread">
                    <h3>{t('details')}</h3>
                    {button(t('close'), () => setDetail(null))}
                  </div>
                  <p className="hint">{t('inspectHint')}</p>
                  <div>{`${detail.parseErrorCount} ${t('parseErrors')}`}</div>
                  <pre>{JSON.stringify(detail, null, 2)}</pre>
                  <div className="buttons">
                    {button(
                      t('previous'),
                      () =>
                        act(
                          {
                            operation: 'inspect',
                            path: detail.path,
                            errorOffset: Math.max(
                              0,
                              detail.errorOffset - detail.errorLimit,
                            ),
                          },
                          setDetail,
                        ),
                      '',
                      !detail.errorOffset,
                    )}
                    {button(
                      t('next'),
                      () =>
                        act(
                          {
                            operation: 'inspect',
                            path: detail.path,
                            errorOffset: detail.errorOffset + detail.errorLimit,
                          },
                          setDetail,
                        ),
                      '',
                      !detail.hasMoreErrors,
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
          {tab === 'build' ? (
            <section>
              <div className="card">
                <div className="grid">
                  <label>
                    {t('game')}
                    <select
                      value={form.game}
                      onChange={(e) => {
                        update('game', e.target.value as Form['game'])
                        update('name', `${e.target.value}-vanilla`)
                        update('workshopIds', [])
                        update('playset', '')
                        setChoices(null)
                      }}
                    >
                      <option value="eu4">{'Europa Universalis IV'}</option>
                      <option value="hoi4">{'Hearts of Iron IV'}</option>
                    </select>
                  </label>
                  {field('name', 'name')}
                </div>
                <p className="hint">{t('renameHint')}</p>
                {field('gameDir', 'gameDir')}
                {field('configDir', 'configDir')}
                <div className="buttons">
                  {button(t('load'), async () => {
                    setBusy(true)
                    setError('')
                    try {
                      const [workshop, playsets] = await Promise.all([
                        api({ operation: 'workshop', game: form.game }),
                        api({ operation: 'playsets', game: form.game }),
                      ])
                      setChoices({ game: form.game, workshop, playsets })
                    } catch (e) {
                      setError(errorMessage(e))
                    } finally {
                      setBusy(false)
                    }
                  })}
                </div>
                <p className="hint">{t('rulesHint')}</p>
                {choices?.game === form.game ? (
                  <div>
                    <label>
                      {t('playset')}
                      <select
                        value={form.playset}
                        onChange={(e) => update('playset', e.target.value)}
                      >
                        <option value="">{t('manual')}</option>
                        {choices.playsets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <h3>{t('workshop')}</h3>
                    <div className="choices">
                      {choices.workshop.length ? (
                        choices.workshop.map((m) => (
                          <label className="check" key={m.workshopId}>
                            <input
                              type="checkbox"
                              checked={form.workshopIds.includes(m.workshopId)}
                              onChange={(e) =>
                                update(
                                  'workshopIds',
                                  e.target.checked
                                    ? [...form.workshopIds, m.workshopId]
                                    : form.workshopIds.filter(
                                        (id) => id !== m.workshopId,
                                      ),
                                )
                              }
                            />
                            {m.name}
                            <small>{m.workshopId}</small>
                          </label>
                        ))
                      ) : (
                        <p className="hint">{t('noWorkshop')}</p>
                      )}
                    </div>
                  </div>
                ) : null}
                <label>
                  {t('mods')}
                  <textarea
                    value={form.mods}
                    onChange={(e) => update('mods', e.target.value)}
                    placeholder="/path/to/mod-a&#xA;/path/to/mod-b"
                  />
                </label>
                {check('autoMods', 'auto')}
                <details>
                  <summary>{t('advanced')}</summary>
                  {field('languages', 'languages')}
                  {check('skipGeneric', 'skip')}
                  {check('noFts', 'noFts')}
                </details>
                <div className="notice">{t('retained')}</div>
                <div className="buttons">
                  {button(t('detect'), () => {
                    const input = JSON.stringify(form)
                    return act(buildRequest('detect'), (value) =>
                      setPreview({ input, value }),
                    )
                  })}
                  {button(
                    t('create'),
                    () => act(buildRequest('index'), () => setTab('tasks')),
                    'primary',
                    !form.name,
                  )}
                </div>
              </div>
              {preview && preview.input === JSON.stringify(form) ? (
                <div className="card">
                  <h3>{t('result')}</h3>
                  <pre>{JSON.stringify(preview.value, null, 2)}</pre>
                </div>
              ) : null}
            </section>
          ) : null}
          {tab === 'tasks' ? (
            <section>
              <p className="hint">{t('unload')}</p>
              {jobs.length ? (
                jobs.map((task) => (
                  <article className="card" key={task.id}>
                    <div className="row spread">
                      <div>
                        <strong>{task.kind}</strong>
                        {' · '}
                        {task.input?.name ?? task.input?.game ?? ''}{' '}
                        <span
                          className={`badge ${task.state === 'succeeded' ? 'ok' : ['failed', 'interrupted'].includes(task.state) ? 'bad' : ''}`}
                        >
                          {t(task.state)}
                        </span>
                      </div>
                      {['running', 'queued', 'cancelling'].includes(task.state)
                        ? button(
                            t('cancel'),
                            () =>
                              act({
                                operation: 'cancel_task',
                                taskId: task.id,
                              }),
                            '',
                            task.state === 'cancelling',
                          )
                        : null}
                    </div>
                    <small>{new Date(task.createdAt).toLocaleString()}</small>
                    {task.progress ? (
                      <div>
                        <p>
                          {task.progress.phase ?? ''}{' '}
                          {task.progress.detail ?? ''}
                        </p>
                        {(task.progress.filesTotal ?? 0) > 0 ? (
                          <div>
                            <progress
                              max={task.progress.filesTotal}
                              value={task.progress.filesDone}
                            />
                            <small>{`${task.progress.filesDone}/${task.progress.filesTotal} ${t('completed')}`}</small>
                          </div>
                        ) : task.progress.bytes ? (
                          <small>{`${t('bytes')} ${(task.progress.bytes / 1048576).toFixed(1)} MiB`}</small>
                        ) : null}
                      </div>
                    ) : null}
                    {task.warnings?.length ? (
                      <div className="notice">{task.warnings.join('\n')}</div>
                    ) : null}
                    {task.error ? (
                      <div className="error">{task.error}</div>
                    ) : null}
                    {task.events?.length ? (
                      <details>
                        <summary>{t('raw')}</summary>
                        <pre className="task-log">{task.events.join('\n')}</pre>
                      </details>
                    ) : null}
                    {task.result ? (
                      <details>
                        <summary>{t('report')}</summary>
                        <pre>{JSON.stringify(task.result, null, 2)}</pre>
                      </details>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="empty">{t('noTasks')}</div>
              )}
            </section>
          ) : null}
          {tab === 'engine' ? (
            <section>
              <div className="card">
                <h3>{t('engine')}</h3>
                <p className="hint">{t('engineHint')}</p>
                <p className="mono">{`${t('enginePath')}: ${state?.engine.executable ?? state?.engine.error ?? ''}`}</p>
                <p className="mono">{`${t('home')}: ${state?.home ?? ''}`}</p>
                <label>
                  {t('external')}
                  <input
                    value={external}
                    onChange={(e) => setExternal(e.target.value)}
                    placeholder={state?.engine.executable ?? ''}
                  />
                </label>
                {button(t('save'), () =>
                  act({ operation: 'configure', executablePath: external }),
                )}
                <p className="hint">{t('language')}</p>
              </div>
              <div className="card">
                <h3>{t('available')}</h3>
                {(state?.environment?.games ?? []).map((g) => (
                  <div className="row spread" key={g.game}>
                    <span>
                      {g.game.toUpperCase()} {g.configReady ? '✓' : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )
    }
    function apply(ctx: ClientContext) {
      ctx.effect(() => ctx.locale.register('eu4Indexer', { zh, en }))
      const t = ctx.locale.bind('eu4Indexer')
      const api: Api = async (request, signal) => {
        const response = await ctx.connection.rpc.call(
          '/api',
          'eu4-indexer/dispatch',
          request,
          signal,
        )
        if (!response.ok) throw new Error(response.error.message)
        return response.value
      }
      const View = (props: { view?: string }) => (
        <Page api={api} t={t} summary={props.view === 'summary'} />
      )
      for (const [name, key] of [
        ['plugins.bundle.config', '@goldenpigeon/dsh-eu4-indexer'],
        ['plugins.row.config', '@goldenpigeon/dsh-eu4-indexer#eu4-indexer'],
      ])
        ctx.slots.inject(name, () =>
          ctx.slots.register({ name, key, locale: 'eu4Indexer' }, View),
        )
    }
    return { inject: ['slots', 'locale', 'connection'], apply, Page }
  },
})
