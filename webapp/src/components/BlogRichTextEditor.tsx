import { Editor } from '@tinymce/tinymce-react'
import type { ComponentProps } from 'react'

import 'tinymce/tinymce'
import 'tinymce/models/dom/model'
import 'tinymce/themes/silver'
import 'tinymce/icons/default'
import 'tinymce/skins/ui/oxide/skin'
import 'tinymce/skins/content/default/content'
import 'tinymce/skins/ui/oxide/content'
import 'tinymce/plugins/advlist'
import 'tinymce/plugins/anchor'
import 'tinymce/plugins/autolink'
import 'tinymce/plugins/charmap'
import 'tinymce/plugins/code'
import 'tinymce/plugins/fullscreen'
import 'tinymce/plugins/image'
import 'tinymce/plugins/insertdatetime'
import 'tinymce/plugins/link'
import 'tinymce/plugins/lists'
import 'tinymce/plugins/media'
import 'tinymce/plugins/nonbreaking'
import 'tinymce/plugins/preview'
import 'tinymce/plugins/quickbars'
import 'tinymce/plugins/searchreplace'
import 'tinymce/plugins/table'
import 'tinymce/plugins/visualblocks'
import 'tinymce/plugins/wordcount'

type BlogRichTextEditorProps = {
  id: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}

type BlogEditorInitOptions = NonNullable<ComponentProps<typeof Editor>['init']>

const blogEditorInit: BlogEditorInitOptions = {
  height: 560,
  min_height: 440,
  menubar: false,
  promotion: false,
  plugins: [
    'advlist',
    'anchor',
    'autolink',
    'charmap',
    'code',
    'fullscreen',
    'image',
    'insertdatetime',
    'link',
    'lists',
    'media',
    'nonbreaking',
    'preview',
    'quickbars',
    'searchreplace',
    'table',
    'visualblocks',
    'wordcount',
  ].join(' '),
  toolbar: [
    'undo redo',
    'blocks',
    'bold italic underline',
    'bullist numlist blockquote',
    'link image table',
    'removeformat',
    'code preview fullscreen',
  ].join(' | '),
  toolbar_mode: 'wrap',
  block_formats: 'Абзац=p;Заголовок 2=h2;Заголовок 3=h3;Заголовок 4=h4;Цитата=blockquote;Код=pre',
  contextmenu: 'link image table',
  quickbars_selection_toolbar: 'bold italic | blocks | blockquote quicklink',
  quickbars_insert_toolbar: false,
  convert_urls: false,
  image_title: true,
  image_dimensions: true,
  paste_data_images: false,
  automatic_uploads: false,
  table_use_colgroups: false,
  object_resizing: 'img',
  content_style: [
    'body { color: #102033; font-family: "Figtree Variable", system-ui, sans-serif; font-size: 16px; line-height: 1.72; padding: 14px; }',
    'p { margin: 0 0 14px; }',
    'h2 { margin: 24px 0 12px; font-size: 30px; line-height: 1.12; }',
    'h3 { margin: 18px 0 10px; font-size: 23px; line-height: 1.2; }',
    'h4 { margin: 16px 0 8px; font-size: 19px; line-height: 1.25; }',
    'ul, ol { margin: 0 0 16px; padding-left: 24px; }',
    'li { margin: 0 0 7px; }',
    'blockquote { margin: 18px 0; border-left: 4px solid #17875d; background: #f4f7fa; padding: 14px 18px; }',
    'a { color: #0b5fb5; }',
    'img { max-width: 100%; height: auto; border-radius: 8px; }',
    'table { width: 100%; border-collapse: collapse; margin: 18px 0; }',
    'td, th { border: 1px solid #dce4ec; padding: 9px 10px; vertical-align: top; }',
    'th { background: #f4f7fa; font-weight: 700; }',
  ].join(' '),
}

export function BlogRichTextEditor({
  id,
  value,
  disabled = false,
  onChange,
}: BlogRichTextEditorProps) {
  return (
    <div className="admin-rich-editor">
      <Editor
        id={id}
        licenseKey="gpl"
        value={value}
        disabled={disabled}
        onEditorChange={onChange}
        init={blogEditorInit}
      />
    </div>
  )
}
