import astroExpressiveCode from "astro-expressive-code";
import {pluginLineNumbers} from "@expressive-code/plugin-line-numbers";
import {pluginCollapsibleSections, pluginCollapsibleSectionsTexts} from "@expressive-code/plugin-collapsible-sections";
import {pluginFramesTexts} from "@expressive-code/plugin-frames";

const codeHighlightIntegration = () => {
    pluginFramesTexts.overrideTexts('en', {
        terminalWindowFallbackTitle: 'My terminal window',
        copyButtonTooltip: '复制代码',
        copyButtonCopied: '已复制'
    });
    pluginCollapsibleSectionsTexts.overrideTexts('en', {
        collapsedLines: '此处折叠代码 {lineCount} 行'
    });
    return astroExpressiveCode({
        themeCssSelector: (theme) => `[data-theme='${theme.type}']`,
        plugins: [pluginLineNumbers(), pluginCollapsibleSections()],
        defaultProps: {
            overridesByLang: {
                "shell,sh,bash,powershell,console,shellsession,ansi": {
                    showLineNumbers: false
                }
            }
        },
        styleOverrides: {
            codeFontFamily: 'CustomMonoFont, JetBrainsMonoNL, OPlusSans3-Regular, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            codeFontSize: '0.875rem',
            codeLineHeight: '1.75',
            uiFontFamily: 'CustomMonoFont, OPlusSans3-Regular, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            frames: {
                frameBoxShadowCssValue: 'unset',
                editorActiveTabIndicatorBottomColor: '#f9826c',
                editorActiveTabIndicatorTopColor: 'unset',
            }
        },
    })
}

export default codeHighlightIntegration