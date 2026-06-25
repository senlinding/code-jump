/*
	1. 对于vscode刚起来时，出现reference不显示结果(next会刷出来)。估计是vscode刚起来扩展系统还没有初始化好。vscode刚起来时，转到定义有时也无效(转到定义OK时，reference没有出现过问题)
*/
const vscode = require('vscode');
const cp = require('child_process');

const showBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);

var keyword = ""
var referResult = null
var referNum = 0
var showIdx = 0
var referProvider = null
var treeView = null
var decoEmitter = null
var REF_DECO_SCHEME = "code-jump-ref"		// 承载行尾引用数徽标的自定义 URI scheme
var myExtensionName = "senlin.code-jump"

function setRefer(refer, idx) {
	referNum = refer
	showIdx = idx
	showStatus()
}

function getReferResultStr() {
	var idx = 0
	if (referNum > 0) {
		idx = showIdx + 1
	}

	return idx + "/" + referNum;
}

function showStatus() {
    showBar.text = "reference: " + getReferResultStr();
    // 状态栏文字保持默认颜色（不覆盖 color）
    showBar.color = undefined;
    showBar.show();
}

function getCursorWord() {
	const { activeTextEditor } = vscode.window;

    if (!activeTextEditor) {
        return;
    }

    const { document, selection } = activeTextEditor;
    const { active, end, start } = selection;

    if (!selection.isSingleLine) {
        return;
    }

    const needleRange = selection.isEmpty ? document.getWordRangeAtPosition(end) : selection;
    if (needleRange === undefined) {
        return;
    }

	return document.getText(needleRange)
}

// 获取工作区根路径。新版 vscode 中 workspace.rootPath 已废弃，
// 优先使用 workspaceFolders，兼容无工作区/多根场景。
function getRootPath() {
	const folders = vscode.workspace.workspaceFolders
	if (folders && folders.length > 0) {
		return folders[0].uri.fsPath
	}
	return vscode.workspace.rootPath || ""
}

function realJump(result) {
	var file = getRootPath() + '/' + result.file
	const options = {
		// 选中第3行第9列到第3行第17列, vscode 行索引可能从0开始
		selection: new vscode.Range(new vscode.Position(result.line - 1, result.start), 
									new vscode.Position(result.line - 1, result.end)),
		// 是否预览，默认true，预览的意思是下次再打开文件是否会替换当前文件
		preview: false,
	};

	vscode.window.showTextDocument(vscode.Uri.file(file), options);
}

function getRgResult(word){
	const config = vscode.workspace.getConfiguration('code jump')
	var rg = config.get("rgPath")

	// 没有配置rg时，使用扩展自带的rg，目前只有ripgrep-12.1.1-x86_64
	if (0 == rg.length) {
		var ext_path = vscode.extensions.getExtension(myExtensionName).extensionPath
		rg = ext_path + "/res/rg"
	}

	const cmd = 'timeout 3 ' + rg + ' -w -s --json -t cpp -t c -t lua -t js -t py ' + word

	cp.exec(cmd, {
		cwd: getRootPath()
	}, (err, stdout, stderr) => {
		if (err) {
			console.log('error: ' + err);
        }
		
		referResult = parseResult(stdout);
		if (referResult.length > 0) {
			setRefer(referResult.length, 0)
			realJump(referResult[0])
			referProvider.refresh()

		} else {
			console.log('code jump no result')
		}
    });
}

function checkFileName(file_name){
	if (file_name.indexOf(".h") > -1) {
		return false
	}

	return true
}

function checkLuaCode(code, file_name){
	var str = code.replace(/\s+/g, "")
	var idx = str.indexOf(keyword)
	if (idx < 0) {
		return false
	}

	if (file_name.indexOf(".lua") > -1) {
		if (str.indexOf("--") == 0) {
			return false
		}
	
		//去除lua中的key=function()
		if (str.indexOf(keyword + "=function(") > 0 || str.indexOf("function") == 0 ||
			str.indexOf("local function") == 0) {
			return false
		}
	}

	return true
}

//获取某个字符的个数
function get_char_num(str, char){
	var i = 0
	var num = 0

	for (i = 0; i < str.length; i++) {
		if (str[i] == char) {
			num ++
		}
	}

	return num;
}

function checkCode(code, file_name){
	var prev_str = ""
	var str = code.replace(/\s+/g, "")
	var idx = str.indexOf(keyword)
	if (idx < 0) {
		return false
	}

	//去除注释 //  /*
	if (str.indexOf("//") == 0 || str.indexOf("/*") == 0) {
		return false
	}

	if (str.indexOf("#define") == 0 && idx > "#define".length) {
		return true
	}

	if (!checkFileName(file_name)) {
		return false
	}

	if (!checkLuaCode(code, file_name)) {
		return false
	}

	//过滤printf("test_func call error")
	if (idx > 1) {	//
		if (get_char_num(str.slice(0, idx), '\"') % 2 == 1 || 
			get_char_num(str.slice(0, idx), "\'") % 2 == 1)
		return false
	}

	if (idx == 0 || str.indexOf("return") == 0) {
		return true
	}

	prev_str = str.slice(idx - 1, idx)
	var isletter = /^[a-zA-Z]+$/.test(prev_str)	//匹配项关键key前不能是字母
	if(!isletter){
		return true
	}

	return false
}

function parseResult(text){
	var arr = text.split("\n")
	console.log(arr)

	var result = new Array();
	var result_idx = 0;
	var i, j, line;

	for (i in arr) {
		if (arr[i].length == 0) {
			continue
		}

		if (arr[i].indexOf('{\"type\":\"match\"') != 0) {
			continue
		}

		var result_obj = JSON.parse(arr[i]);
		if (result_obj == null) {
			continue
		}

		var file = result_obj.data.path.text
		var code = result_obj.data.lines.text
		var file_pos = file.lastIndexOf('/')
		var path = file.substring(0, file_pos)
		var file_name = file.substring(file_pos + 1, )

		if (result_obj.data.submatches.length > 0) {
			if (checkCode(code, file_name)) {
				result.push({
					"file": file,
					"path": path,
					"file_name": file_name,
					"line": result_obj.data.line_number,
					"start": result_obj.data.submatches[0].start,
					"end": result_obj.data.submatches[0].end,
					"code": code,
				})
			}
		}
	}

	console.log(result)
	return result
}

class ReferTreeProvider {
    constructor() {
		this.showResult = null;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
		this.fileCount = 0;
		this.collapsedFiles = new Set();		// 记录已折叠的文件，用于切换展开/折叠按钮图标
	}

	// 根据折叠状态切换标题栏按钮图标（全部折叠时显示“全部展开”）。
	updateCollapseContext() {
		var all = this.fileCount > 0 && this.collapsedFiles.size >= this.fileCount
		vscode.commands.executeCommand('setContext', 'codeJump.allCollapsed', !!all)
	}

	noteCollapse(element) {
		if (element && element.type == "file") {
			this.collapsedFiles.add(element.file)
			this.updateCollapseContext()
		}
	}

	noteExpand(element) {
		if (element && element.type == "file") {
			this.collapsedFiles.delete(element.file)
			this.updateCollapseContext()
		}
	}

	expandAll() {
		if (!treeView || !this.showResult) {
			return
		}
		var i
		for (i in this.showResult) {
			var node = this.showResult[i]
			if (node.type == "file") {
				treeView.reveal(node, { expand: true, select: false, focus: false })
			}
		}
	}

	collapseAll() {
		vscode.commands.executeCommand("workbench.actions.treeView.targetReference.collapseAll")
	}
	
    refresh() {
		// 构造树形结构：顶层为 head + 各文件节点，文件节点的 children 为该文件下的引用行。
		var roots = new Array()
		var codeByIdx = {}
		var headNode = {
			"type": "head",
			"content": ""
		}
		roots.push(headNode)

		var fileCount = 0
		if (referNum > 0) {
			// 按文件聚合（不依赖 rg 输出顺序），保证每个文件只有一个节点、计数准确。
			var fileMap = {}
			var idx
			for (idx in referResult) {
				var r = referResult[idx]
				var nIdx = Number(idx)
				var fileNode = fileMap[r.file]
				if (!fileNode) {
					var nameIdx = r.file.lastIndexOf("/")
					fileNode = {
						"type": "file",
						"content": r.file.substr(nameIdx + 1),
						"file": r.file,
						"idx": nIdx,			// 该文件首个引用，用于点击跳转
						"children": new Array()
					}
					fileMap[r.file] = fileNode
					roots.push(fileNode)
					fileCount++
				}

				var codeNode = {
					"type": "code",
					"content": r.code.trim(),
					"file": r.file,
					"line": r.line,
					"idx": nIdx,
					"parent": fileNode		// 供 getParent / reveal 使用
				}
				fileNode.children.push(codeNode)
				codeByIdx[nIdx] = codeNode
			}
		}

		// head 文案改为搜索框样式的汇总。
		headNode.content = (referNum > 0)
			? (fileCount + " 个文件中有 " + referNum + " 个结果")
			: "未找到结果"

		// 新搜索默认全部展开：重置折叠状态与按钮图标。
		this.fileCount = fileCount
		this.collapsedFiles = new Set()
		this.updateCollapseContext()

		this.showResult = roots
		this.codeByIdx = codeByIdx
		this._onDidChangeTreeData.fire()

		// 通知行尾徽标重新计算。
		if (decoEmitter) {
			decoEmitter.fire()
		}

		// 选中并滚动到当前引用（focus:false 不抢编辑器焦点）。
		this.revealCurrent()
	}

	// 把当前引用滚动到可见并选中（next/prev/跳转后自动定位）。
	revealCurrent() {
		if (referNum <= 0 || !treeView || !this.codeByIdx) {
			return
		}
		var node = this.codeByIdx[showIdx]
		if (node) {
			// select:true 让当前行进入选中态，获得与搜索面板结果一致的选中背景高亮；
			// focus:false 不抢编辑器焦点（呈现“非激活选中”背景，正是搜索结果被打开后的样子）。
			treeView.reveal(node, { select: true, focus: false })
		}
	}

	// 导航/点击时只更新「旧当前项」「新当前项」两个节点（不重建整棵树）。
	// 整树重建会替换所有节点对象，导致 reveal 的选中与异步渲染抢跑、背景不跟随；
	// 这里保持节点对象稳定，仅 targeted 刷新移动图钉，再 reveal 移动选中背景。
	markCurrent(prevIdx) {
		if (referNum <= 0 || !this.codeByIdx) {
			return
		}
		var prevNode = this.codeByIdx[prevIdx]
		if (prevNode && prevIdx != showIdx) {
			this._onDidChangeTreeData.fire(prevNode)	// 去掉旧项图钉
		}
		var node = this.codeByIdx[showIdx]
		if (node) {
			this._onDidChangeTreeData.fire(node)		// 给新项加图钉
			if (treeView) {
				treeView.reveal(node, { select: true, focus: false })
			}
		}
	}

    getChildren (element) {
		if (!element) {
			return this.showResult
		}
		if (element.type == "file") {
			return element.children
		}
		return null
	}

	getParent (element) {
		// reveal() 需要 getParent 才能定位元素。
		if (element && element.type == "code") {
			return element.parent
		}
		return null
	}

	getTreeItem (element) {
		// return null

		// 新版 vscode 要求 label 必须是字符串/TreeItemLabel，做一次兜底防止非法 tree item。
		var label = (element.content == null) ? "" : String(element.content)

		if (element.type == "head") {
			return {
				label: label,
				iconPath: new vscode.ThemeIcon("list-selection")
			}

		} else if (element.type == "file") {
			return {
				label: label,
				// 引用个数通过 FileDecorationProvider 以徽标形式显示在行尾。
				// 用自定义 scheme，避免 file: 资源带来的问题/Git 徽标。
				resourceUri: vscode.Uri.from({
					scheme: REF_DECO_SCHEME,
					path: '/' + element.file,
					query: String(element.children.length)
				}),
				iconPath: vscode.ThemeIcon.File,
				// 作为可折叠父节点，默认展开。
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
				// 点击文件行跳到该文件的首个引用。
				command: {
					"title": "itemClick",
					"command": "itemClick",
					arguments: [{"idx": element.idx}]
				}
			}

		} else {
			var item = {
				label: label,
				tooltip: "",
				command: {
					"title": "itemClick",
					"command": "itemClick",
					arguments: [{"idx": element.idx}]
				}
			}

			// icon 为空时不要设置 iconPath（保持 undefined）。
			// 新版 vscode 校验 getTreeItem 返回值时，iconPath: null 会被判为 invalid tree item。
			if (showIdx == element.idx) {
				// 当前项用图钉形状标识；颜色保持默认（选中背景已表达当前项，
				// 且选中前景色会盖掉图标自定义色，故不再着色）。
				item.iconPath = new vscode.ThemeIcon("pinned")
			}

			return item
		}
	};
}

function activate(context) {
	console.log('Congratulations, your extension "code-jump" is now active!')

	referProvider = new ReferTreeProvider()
	// 用 createTreeView 以获得 TreeView 句柄（reveal 自动定位需要）。
	treeView = vscode.window.createTreeView("targetReference", {
		treeDataProvider: referProvider
	})
	context.subscriptions.push(treeView)

	// 跟踪手动折叠/展开，保持标题栏按钮图标与实际状态一致。
	treeView.onDidCollapseElement(function (e) { referProvider.noteCollapse(e.element) })
	treeView.onDidExpandElement(function (e) { referProvider.noteExpand(e.element) })

	context.subscriptions.push(
		vscode.commands.registerCommand('extension.expandAllReference', function () {
			referProvider.expandAll()
		}))
	context.subscriptions.push(
		vscode.commands.registerCommand('extension.collapseAllReference', function () {
			referProvider.collapseAll()
		}))

	// 行尾引用数徽标：自定义 scheme 的资源由本 provider 决定徽标内容。
	decoEmitter = new vscode.EventEmitter()
	context.subscriptions.push(
		vscode.window.registerFileDecorationProvider({
			onDidChangeFileDecorations: decoEmitter.event,
			provideFileDecoration: function (uri) {
				if (uri.scheme != REF_DECO_SCHEME) {
					return undefined
				}
				var n = parseInt(uri.query, 10) || 0
				return {
					// 徽标最多 2 个字符，>99 显示 99，精确值见 tooltip。
					badge: n > 99 ? "99" : String(n),
					tooltip: n + " 处引用"
				}
			}
		})
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('itemClick', function(item){
			var idx = parseInt(item.idx)
			var prevIdx = showIdx
			setRefer(referNum, idx)
			realJump(referResult[idx])
			referProvider.markCurrent(prevIdx)		// 图钉 + 选中背景跟随点击
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('extension.jumpReference', function () {
			setRefer(0, 0)				//need delete when test
			referProvider.refresh()
			// 仅在用户主动触发查找时弹出/聚焦引用面板（next/prev/点击不再抢焦点）。
			vscode.commands.executeCommand("workbench.view.extension.show-reference")
			keyword = getCursorWord()
			//vscode.window.showInformationMessage(keyword)
			getRgResult(keyword)		//need delete when test
		})
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('extension.jumpNextReference', function () {
			if (referNum > 0) {
				var prevIdx = showIdx
				var idx = (showIdx + 1) % referNum
				setRefer(referNum, idx)
				realJump(referResult[idx])
				referProvider.markCurrent(prevIdx)
				// vscode.commands.executeCommand("itemClick", {"idx": idx})
			}
		})
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('extension.jumpPrevReference', function () {
			if (referNum > 0) {
				var prevIdx = showIdx
				var idx = (showIdx + referNum - 1) % referNum
				setRefer(referNum, idx)
				realJump(referResult[idx])
				referProvider.markCurrent(prevIdx)
				// vscode.commands.executeCommand("itemClick", {"idx": idx})
			}
		})
	)
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
