const vscode = require('vscode')
const fs = require('fs')
const { resolve, extname, dirname, basename } = require('path')
const { readdir } = require('fs').promises
const fdiTerminal = vscode.window.createOutputChannel('FMD')
const configuration = vscode.workspace.getConfiguration('fmd');
const highlightColors = {
    color: '#FFFFFF',
    backgroundColor: '#CF6679',
    overviewRulerColor: '#CF6679',
}

let totalMissingDocumentation = {
    header: {
        name: '📄 {File Header}',
        count: 0,
    },
    headerInfo: {
        name: '📑 {File Header Information}',
        count: 0,
    },
    function: {
        name: '📏 {Function Documentation}',
        count: 0,
    },
    class: {
        name: '📝 {Class Documentation}',
            count: 0,
    },
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    /**
     * Appends a line to the console displaying information about a missing function documentation
     * @param {string} fileName
     * @param {number} i
     */
    function displayMissingFunctionDoc(fileName, i) {
        fdiTerminal.appendLine(`Missing {Function} Doc      : ${fileName}:${i}`)
        totalMissingDocumentation.function.count++
    }

    /**
     * Appends a line to the console displaying information about a missing class documentation
     * @param {string} fileName
     * @param {number} i
     */
    function displayMissingClassDoc(fileName, i) {
        fdiTerminal.appendLine(`Missing {Class} Doc         : ${fileName}:${i}`)
        totalMissingDocumentation.class.count++
    }



    /**
     * Appends a line to the console displaying information about a missing information in the header
     * @param {string} fileName
     * @param {string[]} information
     */
    function displayMissingHeaderInformationDoc(fileName, information) {
        fdiTerminal.appendLine(
            `Missing {Header} Info       : ${fileName}:1 => ${information.join(', ')}`
        )
        totalMissingDocumentation.headerInfo.count++
    }

    /**
     * Appends a line to the console displaying information about a missing file documentation
     * @param {string} fileName
     */
    function displayMissingHeaderDoc(fileName) {
        fdiTerminal.appendLine(`Missing {Header} Doc        : ${fileName}:1`)
        totalMissingDocumentation.header.count++
    }

    function displayTotalMissingDocumentation() {
        fdiTerminal.appendLine('============================')
        fdiTerminal.appendLine(`Total Missing Information   : `)
        for (const [key, value] of Object.entries(totalMissingDocumentation)) {
            fdiTerminal.appendLine(` - ${value.name} => ${value.count}`)
        }
        fdiTerminal.appendLine('============================')
    }

    /**
     * Resets the content of totalMissingDocumentation
     */
    function resetTotalMissingDocumentation() {
        for (const [key, value] of Object.entries(totalMissingDocumentation)) {
            value.count = 0
        }
    }

    /**
     * Recursivly loops though a given folder
     */
    async function* getFiles(dir) {
        const dirents = await readdir(dir, { withFileTypes: true })
        for (const dirent of dirents) {
            const res = resolve(dir, dirent.name)
            if (dirent.isDirectory() &&
                !configuration.get('ignoredFolders').includes(basename(dirname(res)))) {
                yield* getFiles(res)
            } else {
                yield res
            }
        }
    }

    /**
     * Loops though the content of a file to check if it misses documentation
     * @param {string} fileName
     * @param {string} fileContent
     */
    function checkJSFile(fileName, fileContent) {
        let lines = fileContent.split('\n')
        let fRegex = /^\s*(public|private){0,1}\s*(function)\s+.*\s*\(.*\)/gi
        let startClassRegex = /^(\S*class\s+.+){0,1}\s*{\s*$/gim
        let functionInClassRegex = /^\s*.+\S+(.*)\s*{$/gim
        let startHeaderRegex = /\/\*\*/gi
        let endHeaderRegex = /\ \*\//gi
        let endOfCommentRegex = /\*\/|\/\//gi

        let currentlyReadingHeader = false
        let headerWasFound = false
        let lastNotEmptyLine = -1

        let currentlyReadingClass = false;
        let currentBracketLevel = 0;

        let headerInformation = [{
                name: '@author',
                found: false,
            },
            {
                name: '@date',
                found: false,
            },
        ]

        // Parse file
        lines.forEach((line, i) => {
            if (line.length == 1) {
                return
            }

            if (currentlyReadingHeader && new RegExp(endHeaderRegex).test(line)) {
                // Leaving the header
                headerWasFound = true
                currentlyReadingHeader = false

                let missingHeaderInformation = []
                headerInformation.forEach((info) => {
                    if (!info.found) {
                        missingHeaderInformation.push(info.name)
                    }
                })
                if (missingHeaderInformation.length != 0) {
                    displayMissingHeaderInformationDoc(fileName, missingHeaderInformation)
                }
            } else if (currentlyReadingHeader) {
                // Check if header contains certain information
                headerInformation.forEach((info) => {
                    if (line.includes(info.name)) {
                        info.found = true
                    }
                })
            } else if (!headerWasFound && new RegExp(startHeaderRegex).test(line) && lastNotEmptyLine == -1) {
                // Entering the header
                currentlyReadingHeader = true
            } else if (currentlyReadingClass) {
                // Check the bracket's level
                let numberOfOpeningBrackets = (line.match(/{/g) || []).length;
                let numberOfClosingBrackets = (line.match(/}/g) || []).length;
                let bracketsModification = numberOfOpeningBrackets - numberOfClosingBrackets;
                currentBracketLevel += bracketsModification;
                if (currentBracketLevel == 0) {
                    // This means we are out of the class
                    currentlyReadingClass = false;
                } else {
                    // Still in the class
                    if (new RegExp(functionInClassRegex).test(line)) {
                        if (!new RegExp(endOfCommentRegex).test(lines[lastNotEmptyLine])) {
                            displayMissingFunctionDoc(fileName, i + 1)
                        }
                    }
                }

            } else if (line.includes('function') && new RegExp(fRegex).test(line)) {
                if (!new RegExp(endOfCommentRegex).test(lines[lastNotEmptyLine])) {
                    displayMissingFunctionDoc(fileName, i + 1)
                }
            } else if (line.includes('class') && new RegExp(startClassRegex).test(line)) {
                if (!new RegExp(endOfCommentRegex).test(lines[lastNotEmptyLine])) {
                    displayMissingClassDoc(fileName, i + 1)
                    currentlyReadingClass = true;
                    currentBracketLevel = 1;
                }
            }

            lastNotEmptyLine = i
        })
        if (!headerWasFound) {
            displayMissingHeaderDoc(fileName)
        }
    }

    /**
     * Loops though the content of a file to check if it misses documentation
     * @param {string} fileName
     * @param {string} fileContent
     */
    function checkPythonFile(fileName, fileContent) {
        let lines = fileContent.split('\n')
        let testDef = /[^\S\r\n]*def{1}\s+\S+\s*\(\S*\)\s*:/gi;
        let testClass = /\s*class{1}\s+\S+\s*\(?\S*\)?\s*:/gi;
        let testHeader = /\s*"""/gi;
        let testComments = /^\s*"""/gi;
        lines.forEach((line, i) => {
            if (i == 0 && !RegExp(testHeader).test(line)) {
                displayMissingHeaderDoc(fileName);
            } else if (!RegExp(testComments).test(lines[i + 1])) {
                if (RegExp(testDef).test(line)) {
                    displayMissingFunctionDoc(fileName, (i + 2));
                } else if (RegExp(testClass).test(line)) {
                    displayMissingClassDoc(fileName, (i + 2));
                }

            }

        });
    }


    /**
     * Loops though the content of a file to check if it misses documentation
     * @param {string} fileName
     * @param {string} fileContent
     */
    function checkPHPFile(fileName, fileContent) {
        let lines = fileContent.split('\n')
        let fRegex = /^\s*(public|private){0,1}\s*(function)\s+.*\s*\(.*\)/gi
        let startHeaderRegex = /\/\*\*/gi
        let endHeaderRegex = /\ \*\//gi
        let currentlyReadingHeader = false
        let headerWasFound = false
        let lastNotEmptyLine = -1

        let headerInformation = [{
                name: '@author',
                found: false,
            },
            {
                name: '@date',
                found: false,
            },
        ]

        // Parse file
        lines.forEach((line, i) => {
            if (line.length == 1) {
                return
            }
            if (currentlyReadingHeader && new RegExp(endHeaderRegex).test(line)) {
                // Leaving the header
                headerWasFound = true
                currentlyReadingHeader = false
                let missingHeaderInformation = []
                headerInformation.forEach((info) => {
                    if (!info.found) {
                        missingHeaderInformation.push(info.name)
                    }
                })
                if (missingHeaderInformation.length != 0) {
                    displayMissingHeaderInformationDoc(fileName, missingHeaderInformation)
                }
            } else if (currentlyReadingHeader) {
                // Check if header contains certain information
                headerInformation.forEach((info) => {
                    if (line.includes(info.name)) {
                        info.found = true
                    }
                })
            } else if (!headerWasFound &&
                new RegExp(startHeaderRegex).test(line) &&
                lines[lastNotEmptyLine].includes('<?php')
            ) {
                // Entering the header
                currentlyReadingHeader = true
            } else if (line.includes('function') && new RegExp(fRegex).test(line)) {
                let regex = /\*\/|\/\//gi
                if (!new RegExp(regex).test(lines[lastNotEmptyLine])) {
                    displayMissingFunctionDoc(fileName, i + 1)
                }
            }

            lastNotEmptyLine = i
        })
        if (!headerWasFound) {
            displayMissingHeaderDoc(fileName)
        }
    }

    /**
     * Calls a different function to check the content of a file depending on it's extension
     * @param {string} fileName
     * @param {string} fileContent
     */
    function checkFile(fileName, fileContent) {
        switch (extname(fileName)) {
            case '.js':
                checkJSFile(fileName, fileContent)
                break
            case '.php':
                checkPHPFile(fileName, fileContent)
                break
            case '.py':
                checkPythonFile(fileName, fileContent)
        }
    }

    let FMDCurrentFile = vscode.commands.registerCommand(
        'fmd.FMD-CurrentFile',
        function() {
            fdiTerminal.clear()
            resetTotalMissingDocumentation()
            try {
                // Get information
                let fileContent = vscode.window.activeTextEditor.document.getText()
                let fileName = vscode.window.activeTextEditor.document.uri.fsPath;
                checkFile(fileName, fileContent)
                displayTotalMissingDocumentation()
                fdiTerminal.show()
            } catch (error) {
                vscode.window.showInformationMessage('You need to open a file first')
            }

            var startPos = vscode.window.activeTextEditor.document.positionAt(10)
            var endPos = vscode.window.activeTextEditor.document.positionAt(200)
            var decoration = {
                range: new vscode.Range(startPos, endPos),
            }

            /**    vscode.window.activeTextEditor.setDecorations(vscode.window.createTextEditorDecorationType(Object.assign({}, highlightColors, {
                  overviewRulerLane: vscode.OverviewRulerLane.Right
              })), [decoration]);

              setTimeout(() => {
                  vscode.window.activeTextEditor.setDecorations(vscode.window.createTextEditorDecorationType(null), [decoration]);
              }, 3000);
              */
        },
    )

    let FMDCurrentFolder = vscode.commands.registerCommand(
        'fmd.FMD-CurrentFolder',
        function() {
            fdiTerminal.clear()
            resetTotalMissingDocumentation()
            try {
                // Get information
                let fileName = vscode.window.activeTextEditor.document.fileName
                let folderName = fileName.split('\\').slice(0, -1).join('\\')
                let files = fs.readdirSync(folderName)
                files.forEach((file) => {
                    let currentFileName = folderName + '\\' + file
                    if (!fs.lstatSync(currentFileName).isDirectory()) {
                        let content = fs.readFileSync(currentFileName, 'utf-8')
                        checkFile(currentFileName, content)
                    }
                })
                displayTotalMissingDocumentation()
                fdiTerminal.show()
            } catch (error) {
                console.log(error)
                resolve()
                vscode.window.showErrorMessage('FMD : You need to open a file first')
            }
        },
    )

    let FMDSelectedFolderAndSubfolders = vscode.commands.registerCommand(
        'fmd.FMD-SelectedFolderAndSubfolders',
        function() {
            vscode.window
                .showOpenDialog({
                    canSelectMany: false,
                    openLabel: 'Select',
                    canSelectFiles: false,
                    canSelectFolders: true,
                })
                .then((fileUri) => {
                    if (fileUri && fileUri[0]) {
                        fdiTerminal.clear()
                        resetTotalMissingDocumentation()
                        vscode.window.withProgress({
                                location: vscode.ProgressLocation.Notification,
                                title: 'FMD-CurrentWorkspace',
                            },
                            (progress, token) => {
                                return new Promise((resolve) => {
                                    try {
                                        progress.report({ increment: 0 })
                                        checkFolderRecursively(fileUri[0].fsPath, progress, resolve)
                                    } catch (error) {
                                        console.log(error)
                                        resolve()
                                        vscode.window.showErrorMessage(
                                            'FMD : You need to open a file first',
                                        )
                                    }
                                })
                            },
                        )
                    }
                })
        },
    )

    let FMDCurrentWorkspace = vscode.commands.registerCommand(
        'fmd.FMD-CurrentWorkspace',
        function() {
            fdiTerminal.clear()
            resetTotalMissingDocumentation()
            vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'FMD-CurrentWorkspace',
                },
                (progress, token) => {
                    return new Promise((resolve) => {
                        progress.report({ increment: 0 })
                        if (vscode.workspace.workspaceFolders !== undefined) {
                            vscode.workspace.workspaceFolders.forEach((workspace) => {
                                checkFolderRecursively(workspace.uri.fsPath, progress, resolve)
                            })
                        } else {
                            let message =
                                'FMD: Working folder not found, open a folder and try again'
                            vscode.window.showErrorMessage(message)
                        }
                    })
                },
            )
        },
    )

    /**
     * Recusively check folder and subfolders to find missing doc
     */
    function checkFolderRecursively(path, progress, resolve) {
        let nbrFiles = 0;
        (async() => {
            for await (const f of getFiles(path + '/')) {
                nbrFiles++
            }
            return
        })().then(() => {
            let nbrToInc = 100 / nbrFiles;
            (async() => {
                for await (const f of getFiles(path + '/')) {
                    if (!configuration.get('ignoredFolders').includes(basename(dirname(f)))) {
                        let content = fs.readFileSync(f, 'utf-8')
                        checkFile(f, content)
                        progress.report({ increment: nbrToInc, message: 'Running...' })
                    } else {}
                }
            })().then(() => {
                resolve()
                displayTotalMissingDocumentation()
                fdiTerminal.show()
            })
        })
    }

    context.subscriptions.push(FMDCurrentFile)
    context.subscriptions.push(FMDCurrentFolder)
    context.subscriptions.push(FMDSelectedFolderAndSubfolders)
    context.subscriptions.push(FMDCurrentWorkspace)
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
    activate,
    deactivate,
}