/* Browser loader entry. React and Connection come from the DSH client runtime. */
window.__ModuleLoader__.load({
  id: 'dsh-eu4-indexer',
  factory(require) {
    const React = require('react'),
      h = React.createElement
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
      configDir: '规则目录（留空使用托管规则）',
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
        '还没有索引。先下载规则，再选择游戏与模组创建索引；也可以导入已有数据库。',
      noTasks: '暂无后台任务',
      noSessions: '暂无已加载会话。在 DSH 中打开聊天后即可绑定。',
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
      install: '安装 / 更新托管引擎',
      setup: '下载 / 更新规则',
      external: '外部引擎路径（留空使用托管引擎）',
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
      rulesHint: '规则只需下载一次；游戏或模组更新后刷新索引即可。',
      retained: '重建会创建并验证新数据库，完成后切换；失败或取消保留原索引。',
      engineHint:
        '托管引擎随插件构建或从锁定的发布产物安装。外部引擎必须支持管理 API 1。',
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
      configDir: 'Rules directory (blank: managed rules)',
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
        'No indexes yet. Download rules and choose a game and mods to build an index, or import an existing database.',
      noTasks: 'No background tasks',
      noSessions: 'No loaded sessions. Open a DSH chat to bind an index.',
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
      install: 'Install / update managed engine',
      setup: 'Download / update rules',
      external: 'External engine path (blank: managed engine)',
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
        'Download rules once. Refresh indexes after a game or mod update.',
      retained:
        'A rebuild validates a new database before switching. Failure or cancellation retains the previous index.',
      engineHint:
        'The managed engine is bundled at build time or installed from a pinned release artifact. External engines must support management API 1.',
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
    function Page({ api, t, summary }) {
      const [state, setState] = useState(null),
        [tab, setTab] = useState('indexes'),
        [error, setError] = useState(''),
        [busy, setBusy] = useState(false)
      const [form, setForm] = useState({
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
      const [choices, setChoices] = useState(null),
        [preview, setPreview] = useState(null),
        [detail, setDetail] = useState(null),
        [removing, setRemoving] = useState(''),
        [deleteFile, setDeleteFile] = useState(false)
      const [importing, setImporting] = useState(false),
        [importName, setImportName] = useState(''),
        [importPath, setImportPath] = useState(''),
        [external, setExternal] = useState(''),
        [session, setSession] = useState(''),
        [selected, setSelected] = useState('')
      const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))
      const reload = async (signal) => {
        const value = await api({ operation: 'state' }, signal)
        setState(value)
        return value
      }
      useEffect(() => {
        const controller = new AbortController()
        let timer
        const poll = async () => {
          try {
            await reload(controller.signal)
          } catch (e) {
            if (!controller.signal.aborted) setError(e.message)
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
      const act = async (request, callback) => {
        setError('')
        setBusy(true)
        try {
          const result = await api(request)
          if (callback) callback(result)
          await reload()
          return result
        } catch (e) {
          setError(e.message)
        } finally {
          setBusy(false)
        }
      }
      const button = (label, onClick, kind = '', disabled = false) =>
        h(
          'button',
          {
            type: 'button',
            className: kind,
            onClick,
            disabled: busy || disabled,
          },
          label,
        )
      const field = (key, label, props = {}) =>
        h(
          'label',
          null,
          t(label),
          h('input', {
            value: form[key],
            onChange: (e) => update(key, e.target.value),
            ...props,
          }),
        )
      const check = (key, label) =>
        h(
          'label',
          { className: 'check' },
          h('input', {
            type: 'checkbox',
            checked: form[key],
            onChange: (e) => update(key, e.target.checked),
          }),
          t(label),
        )
      const buildRequest = (operation) => ({
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
        return h(
          'span',
          null,
          state
            ? state.engine.ready
              ? `${t('ready')} · ${indexes.length} ${t('indexes')}`
              : t('missing')
            : t('loading'),
        )
      return h(
        'div',
        { className: 'e4' },
        h('style', null, CSS),
        h(
          'header',
          null,
          h(
            'div',
            null,
            h('h2', null, t('title')),
            h('small', null, t('subtitle')),
          ),
          h(
            'span',
            { className: `badge ${state?.engine.ready ? 'ok' : 'bad'}` },
            state?.engine.ready ? t('ready') : t('missing'),
          ),
        ),
        error
          ? h(
              'div',
              { className: 'error', role: 'alert' },
              h('strong', null, t('error') + ' · '),
              error,
              button('×', () => setError('')),
            )
          : null,
        h(
          'nav',
          { role: 'tablist' },
          ...['indexes', 'build', 'tasks', 'engine'].map((id) =>
            h(
              'button',
              {
                key: id,
                role: 'tab',
                'aria-selected': tab === id,
                onClick: () => setTab(id),
              },
              t(id),
              id === 'tasks' &&
                jobs.some((j) => ['running', 'queued'].includes(j.state))
                ? ' •'
                : '',
            ),
          ),
        ),
        !state ? h('div', { className: 'empty' }, t('loading')) : null,
        tab === 'indexes'
          ? h(
              'section',
              null,
              h('div', { className: 'notice' }, t('models')),
              indexes.length
                ? indexes.map((db) =>
                    h(
                      'article',
                      { className: 'card', key: db.name },
                      h(
                        'div',
                        { className: 'row spread' },
                        h(
                          'div',
                          null,
                          h('span', { className: 'index-title' }, db.name),
                          ' ',
                          h(
                            'span',
                            { className: 'badge' },
                            db.game.toUpperCase(),
                          ),
                        ),
                        h(
                          'div',
                          { className: 'row' },
                          button(t('inspect'), () =>
                            act(
                              { operation: 'inspect', name: db.name },
                              setDetail,
                            ),
                          ),
                          button(t('refresh'), () =>
                            act(
                              {
                                operation: 'refresh',
                                name: db.name,
                                game: db.game,
                              },
                              () => setTab('tasks'),
                            ),
                          ),
                          button(
                            t('remove'),
                            () => {
                              setRemoving(db.name)
                              setDeleteFile(false)
                            },
                            'danger',
                          ),
                        ),
                      ),
                      h(
                        'div',
                        { className: 'index-meta' },
                        h('span', null, `${db.sources} ${t('sourceCount')}`),
                        h(
                          'span',
                          null,
                          new Date(db.indexedAt).toLocaleString(),
                        ),
                      ),
                      h('div', { className: 'mono' }, db.path),
                      removing === db.name
                        ? h(
                            'div',
                            { className: 'notice' },
                            t('removeConfirm'),
                            h('p', { className: 'hint' }, t('deleteHint')),
                            h(
                              'label',
                              { className: 'check' },
                              h('input', {
                                type: 'checkbox',
                                checked: deleteFile,
                                onChange: (e) =>
                                  setDeleteFile(e.target.checked),
                              }),
                              t('deleteFile'),
                            ),
                            h(
                              'div',
                              { className: 'buttons' },
                              button(
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
                              ),
                              button(t('cancel'), () => setRemoving('')),
                            ),
                          )
                        : null,
                    ),
                  )
                : h('div', { className: 'empty' }, t('noIndexes')),
              h(
                'div',
                { className: 'card' },
                h('h3', null, t('binding')),
                h(
                  'div',
                  { className: 'grid' },
                  h(
                    'label',
                    null,
                    t('session'),
                    h(
                      'select',
                      {
                        value: session,
                        onChange: (e) => {
                          setSession(e.target.value)
                          setSelected(state.bindings[e.target.value] ?? '')
                        },
                      },
                      h('option', { value: '' }, t('noSessions')),
                      ...(state?.sessions ?? []).map((s) =>
                        h('option', { value: s.id, key: s.id }, s.title),
                      ),
                    ),
                  ),
                  h(
                    'label',
                    null,
                    t('indexes'),
                    h(
                      'select',
                      {
                        value: selected,
                        onChange: (e) => setSelected(e.target.value),
                      },
                      h('option', { value: '' }, t('choose')),
                      ...indexes.map((db) =>
                        h('option', { value: db.name, key: db.name }, db.name),
                      ),
                    ),
                  ),
                ),
                button(
                  t('bind'),
                  () =>
                    act({
                      operation: 'bind',
                      sessionId: session,
                      name: selected,
                    }),
                  'primary',
                  !session || !selected,
                ),
                button(
                  t('unbind'),
                  () => act({ operation: 'unbind', sessionId: session }),
                  '',
                  !session,
                ),
              ),
              button(t('import'), () => setImporting(!importing)),
              importing
                ? h(
                    'div',
                    { className: 'card' },
                    h(
                      'label',
                      null,
                      t('name'),
                      h('input', {
                        value: importName,
                        onChange: (e) => setImportName(e.target.value),
                      }),
                    ),
                    h(
                      'label',
                      null,
                      t('path'),
                      h('input', {
                        value: importPath,
                        onChange: (e) => setImportPath(e.target.value),
                      }),
                    ),
                    button(
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
                    ),
                  )
                : null,
              detail
                ? h(
                    'div',
                    { className: 'card' },
                    h(
                      'div',
                      { className: 'row spread' },
                      h('h3', null, t('details')),
                      button(t('close'), () => setDetail(null)),
                    ),
                    h('p', { className: 'hint' }, t('inspectHint')),
                    h(
                      'div',
                      null,
                      `${detail.parseErrorCount} ${t('parseErrors')}`,
                    ),
                    h('pre', null, JSON.stringify(detail, null, 2)),
                    h(
                      'div',
                      { className: 'buttons' },
                      button(
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
                      ),
                      button(
                        t('next'),
                        () =>
                          act(
                            {
                              operation: 'inspect',
                              path: detail.path,
                              errorOffset:
                                detail.errorOffset + detail.errorLimit,
                            },
                            setDetail,
                          ),
                        '',
                        !detail.hasMoreErrors,
                      ),
                    ),
                  )
                : null,
            )
          : null,
        tab === 'build'
          ? h(
              'section',
              null,
              h(
                'div',
                { className: 'card' },
                h(
                  'div',
                  { className: 'grid' },
                  h(
                    'label',
                    null,
                    t('game'),
                    h(
                      'select',
                      {
                        value: form.game,
                        onChange: (e) => {
                          update('game', e.target.value)
                          update('name', `${e.target.value}-vanilla`)
                          update('workshopIds', [])
                          update('playset', '')
                          setChoices(null)
                        },
                      },
                      h('option', { value: 'eu4' }, 'Europa Universalis IV'),
                      h('option', { value: 'hoi4' }, 'Hearts of Iron IV'),
                    ),
                  ),
                  field('name', 'name'),
                ),
                h('p', { className: 'hint' }, t('renameHint')),
                field('gameDir', 'gameDir'),
                field('configDir', 'configDir'),
                h(
                  'div',
                  { className: 'buttons' },
                  button(t('setup'), () =>
                    act({ operation: 'setup', game: form.game }, () =>
                      setTab('tasks'),
                    ),
                  ),
                  button(t('load'), async () => {
                    setBusy(true)
                    setError('')
                    try {
                      const [workshop, playsets] = await Promise.all([
                        api({ operation: 'workshop', game: form.game }),
                        api({ operation: 'playsets', game: form.game }),
                      ])
                      setChoices({ workshop, playsets })
                    } catch (e) {
                      setError(e.message)
                    } finally {
                      setBusy(false)
                    }
                  }),
                ),
                h('p', { className: 'hint' }, t('rulesHint')),
                choices
                  ? h(
                      'div',
                      null,
                      h(
                        'label',
                        null,
                        t('playset'),
                        h(
                          'select',
                          {
                            value: form.playset,
                            onChange: (e) => update('playset', e.target.value),
                          },
                          h('option', { value: '' }, t('manual')),
                          ...choices.playsets.map((p) =>
                            h('option', { key: p.id, value: p.id }, p.name),
                          ),
                        ),
                      ),
                      h('h3', null, t('workshop')),
                      h(
                        'div',
                        { className: 'choices' },
                        choices.workshop.length
                          ? choices.workshop.map((m) =>
                              h(
                                'label',
                                { className: 'check', key: m.workshopId },
                                h('input', {
                                  type: 'checkbox',
                                  checked: form.workshopIds.includes(
                                    m.workshopId,
                                  ),
                                  onChange: (e) =>
                                    update(
                                      'workshopIds',
                                      e.target.checked
                                        ? [...form.workshopIds, m.workshopId]
                                        : form.workshopIds.filter(
                                            (id) => id !== m.workshopId,
                                          ),
                                    ),
                                }),
                                m.name,
                                h('small', null, m.workshopId),
                              ),
                            )
                          : h('p', { className: 'hint' }, t('noWorkshop')),
                      ),
                    )
                  : null,
                h(
                  'label',
                  null,
                  t('mods'),
                  h('textarea', {
                    value: form.mods,
                    onChange: (e) => update('mods', e.target.value),
                    placeholder: '/path/to/mod-a\n/path/to/mod-b',
                  }),
                ),
                check('autoMods', 'auto'),
                h(
                  'details',
                  null,
                  h('summary', null, t('advanced')),
                  field('languages', 'languages'),
                  check('skipGeneric', 'skip'),
                  check('noFts', 'noFts'),
                ),
                h('div', { className: 'notice' }, t('retained')),
                h(
                  'div',
                  { className: 'buttons' },
                  button(t('detect'), () =>
                    act(buildRequest('detect'), setPreview),
                  ),
                  button(
                    t('create'),
                    () => act(buildRequest('index'), () => setTab('tasks')),
                    'primary',
                    !form.name,
                  ),
                ),
              ),
              preview
                ? h(
                    'div',
                    { className: 'card' },
                    h('h3', null, t('result')),
                    h('pre', null, JSON.stringify(preview, null, 2)),
                  )
                : null,
            )
          : null,
        tab === 'tasks'
          ? h(
              'section',
              null,
              h('p', { className: 'hint' }, t('unload')),
              jobs.length
                ? jobs.map((task) =>
                    h(
                      'article',
                      { className: 'card', key: task.id },
                      h(
                        'div',
                        { className: 'row spread' },
                        h(
                          'div',
                          null,
                          h('strong', null, task.kind),
                          ' · ',
                          task.input?.name ?? task.input?.game ?? '',
                          ' ',
                          h(
                            'span',
                            {
                              className: `badge ${task.state === 'succeeded' ? 'ok' : ['failed', 'interrupted'].includes(task.state) ? 'bad' : ''}`,
                            },
                            t(task.state),
                          ),
                        ),
                        ['running', 'queued', 'cancelling'].includes(task.state)
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
                          : null,
                      ),
                      h(
                        'small',
                        null,
                        new Date(task.createdAt).toLocaleString(),
                      ),
                      task.progress
                        ? h(
                            'div',
                            null,
                            h(
                              'p',
                              null,
                              task.progress.phase ?? '',
                              ' ',
                              task.progress.detail ?? '',
                            ),
                            task.progress.filesTotal > 0
                              ? h(
                                  'div',
                                  null,
                                  h('progress', {
                                    max: task.progress.filesTotal,
                                    value: task.progress.filesDone,
                                  }),
                                  h(
                                    'small',
                                    null,
                                    `${task.progress.filesDone}/${task.progress.filesTotal} ${t('completed')}`,
                                  ),
                                )
                              : task.progress.bytes
                                ? h(
                                    'small',
                                    null,
                                    `${t('bytes')} ${(task.progress.bytes / 1048576).toFixed(1)} MiB`,
                                  )
                                : null,
                          )
                        : null,
                      task.warnings?.length
                        ? h(
                            'div',
                            { className: 'notice' },
                            task.warnings.join('\n'),
                          )
                        : null,
                      task.error
                        ? h('div', { className: 'error' }, task.error)
                        : null,
                      task.events?.length
                        ? h(
                            'details',
                            null,
                            h('summary', null, t('raw')),
                            h(
                              'pre',
                              { className: 'task-log' },
                              task.events.join('\n'),
                            ),
                          )
                        : null,
                      task.result
                        ? h(
                            'details',
                            null,
                            h('summary', null, t('report')),
                            h(
                              'pre',
                              null,
                              JSON.stringify(task.result, null, 2),
                            ),
                          )
                        : null,
                    ),
                  )
                : h('div', { className: 'empty' }, t('noTasks')),
            )
          : null,
        tab === 'engine'
          ? h(
              'section',
              null,
              h(
                'div',
                { className: 'card' },
                h('h3', null, t('engine')),
                h('p', { className: 'hint' }, t('engineHint')),
                h(
                  'p',
                  { className: 'mono' },
                  `${t('enginePath')}: ${state?.engine.executable ?? state?.engine.error ?? ''}`,
                ),
                h(
                  'p',
                  { className: 'mono' },
                  `${t('home')}: ${state?.home ?? ''}`,
                ),
                button(
                  t('install'),
                  () =>
                    act({ operation: 'install_engine' }, () => setTab('tasks')),
                  'primary',
                ),
                h(
                  'label',
                  null,
                  t('external'),
                  h('input', {
                    value: external,
                    onChange: (e) => setExternal(e.target.value),
                    placeholder: state?.engine.executable ?? '',
                  }),
                ),
                button(t('save'), () =>
                  act({ operation: 'configure', executablePath: external }),
                ),
                h('p', { className: 'hint' }, t('language')),
              ),
              h(
                'div',
                { className: 'card' },
                h('h3', null, t('available')),
                ...(state?.environment?.games ?? []).map((g) =>
                  h(
                    'div',
                    { className: 'row spread', key: g.game },
                    h(
                      'span',
                      null,
                      g.game.toUpperCase(),
                      ' ',
                      g.configReady ? '✓' : '—',
                    ),
                    button(t('setup'), () =>
                      act({ operation: 'setup', game: g.game }, () =>
                        setTab('tasks'),
                      ),
                    ),
                  ),
                ),
              ),
            )
          : null,
      )
    }
    function apply(ctx) {
      ctx.locale.register('eu4Indexer', { zh, en })
      const t = ctx.locale.bind('eu4Indexer')
      const api = async (request, signal) => {
        const response = await ctx.connection.rpc.call(
          '/api',
          'eu4-indexer/dispatch',
          request,
          signal,
        )
        if (!response.ok) throw new Error(response.error.message)
        return response.value
      }
      const View = (props) =>
        h(Page, { api, t, summary: props.view === 'summary' })
      for (const [name, key] of [
        ['plugins.bundle.config', 'dsh-eu4-indexer'],
        ['plugins.row.config', 'dsh-eu4-indexer#eu4-indexer'],
      ])
        ctx.slots.inject(name, () =>
          ctx.slots.register({ name, key, locale: 'eu4Indexer' }, View),
        )
    }
    return { inject: ['slots', 'locale', 'connection'], apply, Page }
  },
})
