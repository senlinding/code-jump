// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const cp = require('child_process');

const showBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);

var keyword = ""
var referResult = null
var referNum = 0
var showIdx = 0
var referProvider = null
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
    showBar.color = 'yellow';
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

function realJump(result) {
	var file = vscode.workspace.rootPath + '/' + result.file
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

	const cmd = 'timeout 3 ' + rg + ' -w -s --json -t cpp -t c -t lua ' + word

	cp.exec(cmd, {
		cwd: vscode.workspace.rootPath
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

function checkCode(code){
	var prev_str = ""
	var str = code.replace(/\s+/g, "")
	var idx = str.indexOf(keyword)
	if (idx < 0) {
		return false
	}

	if (idx == 0 || str.indexOf("return") == 0) {
		return true
	}

	prev_str = str.slice(0, idx)
	if (prev_str.indexOf("\"") > 0) {
		return false	//log code
	}

	prev_str = str.slice(idx - 1, idx)
	var isletter = /^[a-zA-Z]+$/.test(prev_str)
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

		var line_text = result_obj.data.lines.text.replace(/\s+/g, "")
		//去除lua中的key=function()
		if (line_text.indexOf(keyword + "=function(") > 0) {
			continue
		}

		//去除注释 //  /*
		if (line_text.indexOf("//") == 0 || line_text.indexOf("/*") == 0 ||
		 	line_text.indexOf("--") == 0) {
			continue
		}

		var file = result_obj.data.path.text
		var code = result_obj.data.lines.text
		var file_pos = file.lastIndexOf('/')
		var path = file.substring(0, file_pos)
		var file_name = file.substring(file_pos + 1, )

		if (checkFileName(file_name) && result_obj.data.submatches.length > 0) {
			if (checkCode(code)) {
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
	}
	
    refresh() {		
		var result = new Array()
		result.push({
			"type": "head",
			"content": "result:" + getReferResultStr()
		})
		
		if (referNum > 0) {
			var prevFile = ""
			var idx
			for (idx in referResult) {
				if (prevFile != referResult[idx].file) {
					var nameIdx = referResult[idx].file.lastIndexOf("/")
					result.push({
						"type": "file",
						"content": referResult[idx].file.substr(nameIdx + 1),
						"idx": idx
					})
					prevFile = referResult[idx].file
				}
				
				result.push({
					"type": "code",
					"content": referResult[idx].code.trim(),
					"idx": idx
				})
			}
		}

		this.showResult = result
		this._onDidChangeTreeData.fire()
		
		vscode.commands.executeCommand("workbench.view.extension.show-reference")
	}
	
    getChildren (element) {
		if (element) {
			return null;
		}

		//return ['first', 'second', 'third'];
		return this.showResult
	}

	getTreeItem (element) {
		// return null

		if (element.type == "head") {
			return {
				label: element.content,
				iconPath: new vscode.ThemeIcon("list-selection")
			}

		} else if (element.type == "file") {
			return {
				label: element.content,
				tooltip: 'File',
				// collapsibleState: collapsible,
				iconPath: vscode.ThemeIcon.File,
			}

		} else {
			var icon = null
			if (showIdx == element.idx) {
				icon = new vscode.ThemeIcon("pinned")	
			}

			return {
				label: element.content,
				tooltip: "",
				command: {
					"title": "itemClick",
					"command": "itemClick",
					arguments: [{"idx": element.idx}]
				},
				iconPath: icon
			}
		}
	};
}

function activate(context) {
	console.log('Congratulations, your extension "code-jump" is now active!')

	referProvider = new ReferTreeProvider()
	vscode.window.registerTreeDataProvider("targetReference", referProvider)

	context.subscriptions.push(
		vscode.commands.registerCommand('itemClick', function(item){
			var idx = parseInt(item.idx)
			setRefer(referNum, idx)
			realJump(referResult[idx])
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('extension.jumpReference', function () {
			setRefer(0, 0)				//need delete when test
			referProvider.refresh()
			keyword = getCursorWord()
			//vscode.window.showInformationMessage(keyword)
			getRgResult(keyword)		//need delete when test
		})
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('extension.jumpNextReference', function () {
			if (referNum > 0) {
				var idx = (showIdx + 1) % referNum
				setRefer(referNum, idx)
				realJump(referResult[idx])
				referProvider.refresh()
				// vscode.commands.executeCommand("itemClick", {"idx": idx})
			}
		})
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('extension.jumpPrevReference', function () {
			if (referNum > 0) {
				var idx = (showIdx + referNum - 1) % referNum
				setRefer(referNum, idx)
				realJump(referResult[idx])
				referProvider.refresh()
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
