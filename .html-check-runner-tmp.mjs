import { build } from 'esbuild'
import { writeFile, unlink } from 'node:fs/promises'
const source = `
import { JSDOM } from 'jsdom'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, serializerCtx, parserCtx } from '@milkdown/kit/core'
import { useBaseWysiwygExtension } from './src/features/editor/extensions/base/index.ts'
import { useHtmlWysiwygExtension } from './src/features/editor/extensions/html/index.ts'
import { useWysiwygMarkdownExtensions } from './src/features/editor/extensions/index.ts'
const dom = new JSDOM('<div id="editor"></div>', {pretendToBeVisual:true})
for (const name of ['window','document','navigator','HTMLElement','Element','Node','MutationObserver','CustomEvent','DOMParser','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','addEventListener','removeEventListener','dispatchEvent']) Object.defineProperty(globalThis,name,{value: typeof dom.window[name] === 'function' && /^[a-z]/.test(name) ? dom.window[name].bind(dom.window) : dom.window[name],configurable:true})
const editor = await useWysiwygMarkdownExtensions(Editor.make().config(ctx=>{ctx.set(rootCtx,document.querySelector('#editor'));ctx.set(defaultValueCtx,'<span>sfs')}), {importImageFile:async()=>null,isDocumentActive:()=>true,onImageSelect:()=>{},resolveImageSource:s=>s}).create()
const view = editor.action(ctx=>ctx.get(editorViewCtx))
view.dispatch(view.state.tr.setSelection((await import('@milkdown/kit/prose/state')).TextSelection.atEnd(view.state.doc)))
for (const text of '</span>') {
 const {from,to}=view.state.selection
 const handled=view.someProp('handleTextInput',fn=>fn(view,from,to,text))
 if(!handled) view.dispatch(view.state.tr.insertText(text,from,to))
}
console.log('TYPED',JSON.stringify(view.state.doc.toJSON()))
console.log('DOM',view.dom.innerHTML)
console.log('SAVED',editor.action(ctx=>ctx.get(serializerCtx)(view.state.doc)))
for(const source of ['<span>sfs</span>','<span style="color:red">**red**</span>']) console.log('PARSED',source,JSON.stringify(editor.action(ctx=>ctx.get(parserCtx)(source)).toJSON()))
await editor.destroy()
`
const out = await build({stdin:{contents:source,resolveDir:process.cwd(),sourcefile:'html-check.ts',loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'}})
const path='.html-check-tmp.mjs'
try {await writeFile(path,out.outputFiles[0].text);await import('./'+path)} finally {await unlink(path)}


