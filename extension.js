const vscode = require('vscode');
const fs = require('fs');
const { resolve, extname } = require('path');
const { readdir } = require('fs').promises;
const path = require('path');
const fdiTerminal = vscode.window.createOutputChannel("FMD");
const activeEditor = vscode.window.activeTextEditor;
const highlightColors = {
    color: "#FFFFFF",
    backgroundColor: "#CF6678",
    overviewRulerColor: "#CF6679"
}

let totalMissingDocumentation = {
    header: {
        name: "File Header",
        count: 0
    },
    headerInfo: {
        name: "File Header Information",
        count: 0
    },
    function: {
        name: "Function Documentation",
        count: 0
    },
};

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
        fdiTerminal.appendLine(`Missing function doc : ${fileName}:${i}`);
        totalMissingDocumentation.function.count++;
    }
    /**
     * Appends a line to the console displaying information about a missing information in the header
     * @param {string} fileName
     * @param {string[]} information
     */
    function displayMissingHeaderInformationDoc(fileName, information) {
        fdiTerminal.appendLine(`Missing file header info : ${fileName}:1 => ${information.join(', ')}`);
        totalMissingDocumentation.headerInfo.count++;
    }

    /**
     * Appends a line to the console displaying information about a missing file documentation
     * @param {string} fileName
     */
    function displayMissingHeaderDoc(fileName) {
        fdiTerminal.appendLine(`Missing file header doc : ${fileName}:1`);
        totalMissingDocumentation.header.count++;
    }

    function displayTotalMissingDocumentation() {
        fdiTerminal.appendLine("====================");
        fdiTerminal.appendLine(`Total missing information :`);
        for (const [key, value] of Object.entries(totalMissingDocumentation)) {
            fdiTerminal.appendLine(` - ${value.name} => ${value.count}`);
        }
        fdiTerminal.appendLine("====================");

    }

    /**
     * Resets the content of totalMissingDocumentation
     */
    function resetTotalMissingDocumentation() {
        for (const [key, value] of Object.entries(totalMissingDocumentation)) {
            value.count = 0;
        }
    }

    /**
     * Recursivly loops though a given folder 
     */
    async function* getFiles(dir) {
        const dirents = await readdir(dir, { withFileTypes: true });
        for (const dirent of dirents) {
            const res = resolve(dir, dirent.name);
            if (dirent.isDirectory()) {
                yield* getFiles(res);
            } else {
                yield res;
            }
        }
    }



    /**
     * Loops though the content of a file to check if it misses documentation
     * @param {string} fileName
     * @param {string} fileContent
     */
    function checkJSFile(fileName, fileContent) {
        let lines = fileContent.split('\n');
        let fRegex = /\s*(public|private){0,1}\s*(function)\s+.*\s*\(.*\)/gi;
        let startHeaderRegex = /\/\*\*/gi;
        let endHeaderRegex = /\ \*\//gi;
        let currentlyReadingHeader = false;
        let headerWasFound = false;
        let lastNotEmptyLine = -1;

        let headerInformation = [{
            "name": "@author",
            "found": false
        }, {
            "name": "@date",
            "found": false
        }];

        // Parse file
        lines.forEach((line, i) => {
            if (line.length == 1) {
                return;
            }
            if (currentlyReadingHeader && new RegExp(endHeaderRegex).test(line)) {
                // Leaving the header
                headerWasFound = true;
                currentlyReadingHeader = false;

                let missingHeaderInformation = [];
                headerInformation.forEach(info => {
                    if (!info.found) {
                        missingHeaderInformation.push(info.name);
                    }
                });
                if (missingHeaderInformation.length != 0) {
                    displayMissingHeaderInformationDoc(fileName, missingHeaderInformation);
                }
            } else if (currentlyReadingHeader) {
                // Check if header contains certain information
                headerInformation.forEach(info => {
                    if (line.includes(info.name)) {
                        info.found = true;
                    }
                });
            } else if (!headerWasFound && new RegExp(startHeaderRegex).test(line) && lastNotEmptyLine == -1) {
                // Entering the header
                currentlyReadingHeader = true;

            } else if (line.includes("function") && new RegExp(fRegex).test(line)) {
                let regex = /\*\/|\/\//gi;
                if (!new RegExp(regex).test(lines[lastNotEmptyLine])) {
                    displayMissingFunctionDoc(fileName, i + 1)
                }
            }

            lastNotEmptyLine = i;
        });
        if (!headerWasFound) {
            displayMissingHeaderDoc(fileName);
        }
    }

    /**
     * Loops though the content of a file to check if it misses documentation
     * @param {string} fileName
     * @param {string} fileContent
     */
    function checkPHPFile(fileName, fileContent) {
        let lines = fileContent.split('\n');
        let fRegex = /\s*(public|private){0,1}\s*(function)\s+.*\s*\(.*\)/gi;
        let startHeaderRegex = /\/\*\*/gi;
        let endHeaderRegex = /\ \*\//gi;
        let currentlyReadingHeader = false;
        let headerWasFound = false;
        let lastNotEmptyLine = -1;

        let headerInformation = [{
            "name": "@author",
            "found": false
        }, {
            "name": "@date",
            "found": false
        }];

        // Parse file
        lines.forEach((line, i) => {
            if (line.length == 1) {
                return;
            }
            if (currentlyReadingHeader && new RegExp(endHeaderRegex).test(line)) {
                // Leaving the header
                headerWasFound = true;
                currentlyReadingHeader = false;
                let missingHeaderInformation = [];
                headerInformation.forEach(info => {
                    if (!info.found) {
                        missingHeaderInformation.push(info.name);
                    }
                });
                if (missingHeaderInformation.length != 0) {
                    displayMissingHeaderInformationDoc(fileName, missingHeaderInformation);
                }
            } else if (currentlyReadingHeader) {
                // Check if header contains certain information
                headerInformation.forEach(info => {
                    if (line.includes(info.name)) {
                        info.found = true;
                    }
                });
            } else if (!headerWasFound && new RegExp(startHeaderRegex).test(line) && lines[lastNotEmptyLine].includes('<?php')) {
                // Entering the header
                currentlyReadingHeader = true;
            } else if (line.includes("function") && new RegExp(fRegex).test(line)) {
                let regex = /\*\/|\/\//gi;
                if (!new RegExp(regex).test(lines[lastNotEmptyLine])) {
                    displayMissingFunctionDoc(fileName, i + 1)
                }
            }

            lastNotEmptyLine = i;
        });
        if (!headerWasFound) {
            displayMissingHeaderDoc(fileName);
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
                checkJSFile(fileName, fileContent);
                break;
            case '.php':
                checkPHPFile(fileName, fileContent);
                break;
        }
    }

    let FMDCurrentFile = vscode.commands.registerCommand('fmd.FMD-CurrentFile', function() {
        fdiTerminal.clear();
        resetTotalMissingDocumentation();
        try {
            // Get information
            let fileContent = activeEditor.document.getText();
            let fileName = activeEditor.document.fileName;
            checkFile(fileName, fileContent);
            displayTotalMissingDocumentation();
            fdiTerminal.show();
        } catch (error) {
            vscode.window.showInformationMessage("You need to open a file first");
        }

        var startPos = activeEditor.document.positionAt(10);
        var endPos = activeEditor.document.positionAt(200);
        var decoration = {
            range: new vscode.Range(startPos, endPos)
        };


        activeEditor.setDecorations(vscode.window.createTextEditorDecorationType(Object.assign({}, highlightColors, {
            overviewRulerLane: vscode.OverviewRulerLane.Right
        })), [decoration]);

        setTimeout(() => {
            activeEditor.setDecorations(vscode.window.createTextEditorDecorationType(null), [decoration]);
        }, 3000);
    });


    let FMDCurrentFolder = vscode.commands.registerCommand('fmd.FMD-CurrentFolder', function() {
        fdiTerminal.clear();
        resetTotalMissingDocumentation();
        try {
            // Get information
            let fileName = activeEditor.document.fileName;
            let folderName = fileName.split('\\').slice(0, -1).join('\\');
            let files = fs.readdirSync(folderName);
            files.forEach(file => {
                let currentFileName = folderName + '\\' + file;
                if (!fs.lstatSync(currentFileName).isDirectory()) {
                    let content = fs.readFileSync(currentFileName, 'utf-8');
                    checkFile(currentFileName, content);
                }
            });
            displayTotalMissingDocumentation();
            fdiTerminal.show();
        } catch (error) {
            console.log(error);
            resolve();
            vscode.window.showErrorMessage("FMD : You need to open a file first");
        }
    });

    let FMDSelectedFolderAndSubfolders = vscode.commands.registerCommand('fmd.FMD-SelectedFolderAndSubfolders', function() {

        vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Select',
            canSelectFiles: false,
            canSelectFolders: true
        }).then(fileUri => {
            if (fileUri && fileUri[0]) {
                fdiTerminal.clear();
                resetTotalMissingDocumentation();
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "FMD-CurrentWorkspace",
                }, (progress, token) => {
                    return new Promise(resolve => {
                        try {
                            progress.report({ increment: 0 });
                            checkFolderRecursively(fileUri[0].fsPath, progress, resolve);
                        } catch (error) {
                            console.log(error);
                            resolve();
                            vscode.window.showErrorMessage("FMD : You need to open a file first");
                        }
                    });
                });
            }
        });
    });

    let FMDCurrentWorkspace = vscode.commands.registerCommand('fmd.FMD-CurrentWorkspace', function() {
        fdiTerminal.clear();
        resetTotalMissingDocumentation();
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "FMD-CurrentWorkspace",
        }, (progress, token) => {
            return new Promise(resolve => {
                progress.report({ increment: 0 });
                if (vscode.workspace.workspaceFolders !== undefined) {
                    vscode.workspace.workspaceFolders.forEach(workspace => {
                        checkFolderRecursively(workspace.uri.fsPath, progress, resolve);
                    })
                } else {
                    let message = "FMD: Working folder not found, open a folder and try again";
                    vscode.window.showErrorMessage(message);
                }

            });
        });
    });

    /**
     * Recusively check folder and subfolders to find missing doc
     */
    function checkFolderRecursively(path, progress, resolve) {
        let nbrFiles = 0;
        (async() => {
            for await (const f of getFiles(path + "/")) {
                nbrFiles++;
            }
            return;
        })().then(() => {
            let nbrToInc = 100 / nbrFiles;
            (async() => {
                for await (const f of getFiles(path + "/")) {
                    let content = fs.readFileSync(f, 'utf-8');
                    checkFile(f, content);
                    progress.report({ increment: nbrToInc, message: "Running..." });
                }
            })().then(() => {
                resolve();
                displayTotalMissingDocumentation();
                fdiTerminal.show();
            });
        })
    }


    context.subscriptions.push(FMDCurrentFile);
    context.subscriptions.push(FMDCurrentFolder);
    context.subscriptions.push(FMDSelectedFolderAndSubfolders);
    context.subscriptions.push(FMDCurrentWorkspace);
}


// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
    activate,
    deactivate
}