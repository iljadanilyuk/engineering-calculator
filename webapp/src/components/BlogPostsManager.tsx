import {
  blogContentPlainText,
  renderBlogContentHtml,
  type BlogPostCreateRequest,
  type BlogPostRecord,
  type BlogPostStatus,
} from '@poznyak-engineering-calculator/contracts'
import { lazy, Suspense, type FormEvent, useMemo, useState } from 'react'

import {
  AdminPageHeader,
  AdminPanel,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  MetricTile,
  StatusPill,
} from '@/components/AdminPrimitives'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Typography } from '@/components/ui/typography'
import { formatDateTime, numberFormatter } from '@/lib/admin-derived'
import { ApiRequestError } from '@/lib/api'
import {
  dateTimeLocalInputToIso,
  isoToDateTimeLocalInputValue,
} from '@/lib/blog-post-time'
import {
  useBlogPostsQuery,
  useCreateBlogPostMutation,
  useUpdateBlogPostMutation,
} from '@/lib/blog-posts-queries'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'

type BlogPostFormState = {
  slug: string
  title: string
  excerpt: string
  content: string
  coverImageUrl: string
  category: string
  tags: string
  seoTitle: string
  seoDescription: string
  status: BlogPostStatus
  publishedAt: string
  publishedAtOriginalIso: string | null
  sortOrder: string
}

const emptyPosts: BlogPostRecord[] = []
const BlogRichTextEditor = lazy(async () => {
  const module = await import('@/components/BlogRichTextEditor')
  return { default: module.BlogRichTextEditor }
})
const blogStatusLabels: Record<BlogPostStatus, string> = {
  draft: 'Черновик',
  published: 'Опубликована',
  archived: 'Архив',
}

export function BlogPostsManager() {
  const auth = useAuth()
  const postsQuery = useBlogPostsQuery({
    api: auth.api,
    enabled: auth.isAuthenticated,
  })
  const createPost = useCreateBlogPostMutation({ api: auth.api })
  const updatePost = useUpdateBlogPostMutation({ api: auth.api })
  const posts = postsQuery.data?.posts ?? emptyPosts
  const sortedPosts = useMemo(() => sortBlogPosts(posts), [posts])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<BlogPostRecord | null>(null)
  const [formState, setFormState] = useState<BlogPostFormState>(() => defaultFormState(10))
  const [formError, setFormError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null)

  const publishedCount = posts.filter((post) => post.status === 'published').length
  const draftCount = posts.filter((post) => post.status === 'draft').length
  const archivedCount = posts.filter((post) => post.status === 'archived').length
  const nextSortOrder = nextBlogPostSortOrder(sortedPosts)
  const isSaving = createPost.isPending || updatePost.isPending
  const isMutating = updatePost.isPending

  function openCreateDrawer() {
    setEditingPost(null)
    setFormState(defaultFormState(nextSortOrder))
    setFormError(null)
    setDrawerOpen(true)
  }

  function openEditDrawer(post: BlogPostRecord) {
    setEditingPost(post)
    setFormState(formStateFromPost(post))
    setFormError(null)
    setDrawerOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const payload = buildPayload(formState)
    if ('error' in payload) {
      setFormError(payload.error)
      return
    }

    try {
      if (editingPost) {
        await updatePost.mutateAsync({
          id: editingPost.id,
          input: payload.value,
        })
      } else {
        await createPost.mutateAsync(payload.value)
      }

      setDrawerOpen(false)
      setEditingPost(null)
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  async function publishPost(post: BlogPostRecord) {
    setActionError(null)
    setConfirmArchiveId(null)

    if (!canPublishBlogPost(post)) {
      setActionError('Для публикации заполните название, анонс и текст статьи.')
      return
    }

    try {
      await updatePost.mutateAsync({
        id: post.id,
        input: { status: 'published' },
      })
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  async function unpublishPost(post: BlogPostRecord) {
    setActionError(null)
    setConfirmArchiveId(null)

    try {
      await updatePost.mutateAsync({
        id: post.id,
        input: { status: 'draft' },
      })
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  async function archivePost(post: BlogPostRecord) {
    setActionError(null)

    if (post.status !== 'archived' && confirmArchiveId !== post.id) {
      setConfirmArchiveId(post.id)
      return
    }

    try {
      await updatePost.mutateAsync({
        id: post.id,
        input: { status: post.status === 'archived' ? 'draft' : 'archived' },
      })
      setConfirmArchiveId(null)
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  return (
    <section className="admin-view" aria-labelledby="blog-posts-heading">
      <AdminPageHeader
        eyebrow="Настройка продукта"
        title="Блог и публикации"
        description="Статьи, новости и SEO-материалы для публичного раздела /blog/. Черновики и архив не показываются на сайте."
        actions={
          <Button type="button" onClick={openCreateDrawer}>
            Добавить статью
          </Button>
        }
      />

      <div className="admin-priority-strip">
        <MetricTile label="Опубликованы" value={publishedCount} tone="green" />
        <MetricTile label="Черновики" value={draftCount} tone="amber" />
        <MetricTile label="Архив" value={archivedCount} tone="gray" />
      </div>

      <AdminPanel
        title="Редакционный список"
        description="Публичный сайт получает только опубликованные статьи. Для статического сайта изменения видны после следующей сборки."
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => void postsQuery.refetch()}>
            Обновить
          </Button>
        }
      >
        <div className="admin-stack">
          {actionError && (
            <Alert variant="destructive">
              <AlertTitle>Не удалось выполнить действие со статьей</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          {postsQuery.isLoading ? (
            <LoadingBlock label="Загружаем статьи..." />
          ) : postsQuery.isError ? (
            <ErrorBlock
              title="Не удалось загрузить статьи"
              description={errorMessage(postsQuery.error)}
              onRetry={() => void postsQuery.refetch()}
            />
          ) : sortedPosts.length === 0 ? (
            <EmptyState
              title="Статей пока нет"
              description="Создайте первый материал, сохраните черновик и опубликуйте его после проверки."
              action={
                <Button type="button" onClick={openCreateDrawer}>
                  Добавить статью
                </Button>
              }
            />
          ) : (
            <>
              <div className="admin-table-wrap desktop-only">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Статья</TableHead>
                      <TableHead>Рубрика и теги</TableHead>
                      <TableHead>Публикация</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPosts.map((post) => (
                      <TableRow key={post.id} className={cn(post.status === 'archived' && 'bg-muted/30 text-muted-foreground')}>
                        <TableCell className="min-w-[320px] whitespace-normal">
                          <BlogPostTitle post={post} />
                        </TableCell>
                        <TableCell className="min-w-[180px] whitespace-normal">
                          <BlogPostTaxonomy post={post} />
                        </TableCell>
                        <TableCell className="min-w-[170px] whitespace-normal">
                          <Typography variant="bodySmMedium">
                            {post.publishedAt ? formatDateTime(post.publishedAt) : 'Не опубликована'}
                          </Typography>
                          <Typography className="numeric" variant="caption" tone="muted">
                            Порядок {numberFormatter.format(post.sortOrder)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <BlogPostStatusPill status={post.status} />
                        </TableCell>
                        <TableCell>
                          <BlogPostActions
                            post={post}
                            confirmArchiveId={confirmArchiveId}
                            disabled={isMutating}
                            onEdit={openEditDrawer}
                            onPublish={publishPost}
                            onUnpublish={unpublishPost}
                            onArchive={archivePost}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mobile-card-list">
                {sortedPosts.map((post) => (
                  <BlogPostMobileCard
                    key={post.id}
                    post={post}
                    confirmArchiveId={confirmArchiveId}
                    disabled={isMutating}
                    onEdit={openEditDrawer}
                    onPublish={publishPost}
                    onUnpublish={unpublishPost}
                    onArchive={archivePost}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </AdminPanel>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="admin-drawer admin-editor-drawer admin-blog-drawer" side="right">
          <form className="admin-drawer-form" onSubmit={(event) => void handleSubmit(event)}>
            <SheetHeader>
              <SheetTitle>{editingPost ? 'Редактировать статью' : 'Добавить статью'}</SheetTitle>
              <SheetDescription>
                Текст статьи можно подготовить с простыми заголовками и списками.
              </SheetDescription>
            </SheetHeader>

            <div className="admin-drawer-body admin-editor-body">
              {formError && (
                <Alert variant="destructive">
                  <AlertTitle>Не удалось сохранить статью</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <FieldGroup className="admin-form-grid admin-editor-layout">
                <div className="admin-editor-main">
                  <div className="admin-drawer-grid two">
                    <Field>
                      <FieldLabel htmlFor="blog-title">Название</FieldLabel>
                      <Input
                        id="blog-title"
                        value={formState.title}
                        onChange={(event) => setFormState({ ...formState, title: event.target.value })}
                        autoComplete="off"
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="blog-slug">Адрес страницы</FieldLabel>
                      <Input
                        id="blog-slug"
                        value={formState.slug}
                        onChange={(event) => setFormState({ ...formState, slug: event.target.value })}
                        autoComplete="off"
                        placeholder="kak-podgotovitsya-k-proektu"
                      />
                      <FieldDescription>Можно оставить пустым при создании: система сформирует адрес автоматически.</FieldDescription>
                    </Field>
                  </div>

                  <Field>
                    <FieldLabel htmlFor="blog-excerpt">Анонс</FieldLabel>
                    <Textarea
                      id="blog-excerpt"
                      value={formState.excerpt}
                      onChange={(event) => setFormState({ ...formState, excerpt: event.target.value })}
                      rows={3}
                      required
                    />
                  </Field>

                  <Field className="admin-editor-content-field">
                    <FieldLabel htmlFor="blog-content">Текст статьи</FieldLabel>
                    <Suspense fallback={<LoadingBlock label="Загружаем редактор..." />}>
                      <BlogRichTextEditor
                        id="blog-content"
                        value={formState.content}
                        disabled={isSaving}
                        onChange={(content) => setFormState({ ...formState, content })}
                      />
                    </Suspense>
                    <FieldDescription>Поддерживаются форматирование, заголовки, списки, ссылки, изображения по URL, таблицы и HTML-код.</FieldDescription>
                  </Field>

                  <div className="admin-drawer-grid two">
                    <Field>
                      <FieldLabel htmlFor="blog-cover">Обложка</FieldLabel>
                      <Input
                        id="blog-cover"
                        value={formState.coverImageUrl}
                        onChange={(event) => setFormState({ ...formState, coverImageUrl: event.target.value })}
                        autoComplete="off"
                        placeholder="/landing-v4/project-preview-spec-10.jpg"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="blog-category">Рубрика</FieldLabel>
                      <Input
                        id="blog-category"
                        value={formState.category}
                        onChange={(event) => setFormState({ ...formState, category: event.target.value })}
                        autoComplete="off"
                        placeholder="Практика"
                      />
                    </Field>
                  </div>

                  <Field>
                    <FieldLabel htmlFor="blog-tags">Теги</FieldLabel>
                    <Input
                      id="blog-tags"
                      value={formState.tags}
                      onChange={(event) => setFormState({ ...formState, tags: event.target.value })}
                      autoComplete="off"
                      placeholder="ОВ, отопление, частный дом"
                    />
                    <FieldDescription>Разделяйте запятыми или новой строкой.</FieldDescription>
                  </Field>

                  <div className="admin-drawer-grid two">
                    <Field>
                      <FieldLabel htmlFor="blog-seo-title">Заголовок для поиска</FieldLabel>
                      <Input
                        id="blog-seo-title"
                        value={formState.seoTitle}
                        onChange={(event) => setFormState({ ...formState, seoTitle: event.target.value })}
                        autoComplete="off"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="blog-seo-description">Описание для поиска</FieldLabel>
                      <Textarea
                        id="blog-seo-description"
                        value={formState.seoDescription}
                        onChange={(event) => setFormState({ ...formState, seoDescription: event.target.value })}
                        rows={3}
                      />
                    </Field>
                  </div>
                </div>

                <aside className="admin-editor-side" aria-label="Публикация и предпросмотр статьи">
                  <FieldGroup className="admin-form-grid">
                    <div className="admin-drawer-grid">
                      <Field>
                        <FieldLabel htmlFor="blog-status">Статус</FieldLabel>
                        <NativeSelect
                          id="blog-status"
                          className="w-full"
                          value={formState.status}
                          onChange={(event) => setFormState({ ...formState, status: blogStatus(event.target.value) })}
                        >
                          {blogStatusOptions.map((status) => (
                            <NativeSelectOption key={status} value={status}>
                              {blogStatusLabels[status]}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="blog-published-at">Дата публикации</FieldLabel>
                        <Input
                          id="blog-published-at"
                          type="datetime-local"
                          step="1"
                          value={formState.publishedAt}
                          onChange={(event) => setFormState({ ...formState, publishedAt: event.target.value })}
                          autoComplete="off"
                        />
                        <FieldDescription>Если пусто при публикации, система поставит текущее время.</FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="blog-sort-order">Порядок</FieldLabel>
                        <Input
                          id="blog-sort-order"
                          value={formState.sortOrder}
                          onChange={(event) => setFormState({ ...formState, sortOrder: event.target.value })}
                          inputMode="numeric"
                          autoComplete="off"
                          required
                        />
                      </Field>
                    </div>

                    <Field>
                      <FieldLabel>Предпросмотр</FieldLabel>
                      <BlogPreview state={formState} />
                    </Field>
                  </FieldGroup>
                </aside>
              </FieldGroup>
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setDrawerOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Сохраняем...' : 'Сохранить статью'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </section>
  )
}

function BlogPostTitle({ post }: { post: BlogPostRecord }) {
  return (
    <div className="admin-case-title">
      <Typography variant="bodySmMedium">{post.title}</Typography>
      <Typography className="numeric" variant="caption" tone="muted">/blog/{post.slug}/</Typography>
      <Typography variant="caption" tone="muted">{post.excerpt}</Typography>
    </div>
  )
}

function BlogPostTaxonomy({ post }: { post: BlogPostRecord }) {
  return (
    <div className="admin-case-title">
      <Typography variant="bodySmMedium">{post.category ?? 'Без рубрики'}</Typography>
      <InlineList values={post.tags} empty="Теги не указаны" />
    </div>
  )
}

function InlineList({ values, empty }: { values: readonly string[]; empty: string }) {
  if (values.length === 0) return <Typography variant="caption" tone="muted">{empty}</Typography>

  return (
    <div className="admin-case-pill-list">
      {values.map((value) => (
        <StatusPill key={value} tone="blue">{value}</StatusPill>
      ))}
    </div>
  )
}

function BlogPostStatusPill({ status }: { status: BlogPostStatus }) {
  if (status === 'published') return <StatusPill tone="green">{blogStatusLabels[status]}</StatusPill>
  if (status === 'archived') return <StatusPill tone="gray">{blogStatusLabels[status]}</StatusPill>
  return <StatusPill tone="amber">{blogStatusLabels[status]}</StatusPill>
}

function BlogPostActions({
  post,
  confirmArchiveId,
  disabled,
  onEdit,
  onPublish,
  onUnpublish,
  onArchive,
}: {
  post: BlogPostRecord
  confirmArchiveId: string | null
  disabled: boolean
  onEdit: (post: BlogPostRecord) => void
  onPublish: (post: BlogPostRecord) => void | Promise<void>
  onUnpublish: (post: BlogPostRecord) => void | Promise<void>
  onArchive: (post: BlogPostRecord) => void | Promise<void>
}) {
  return (
    <div className="admin-row-actions">
      <Button type="button" variant="outline" size="sm" onClick={() => onEdit(post)}>
        Редактировать
      </Button>
      {post.status === 'published' ? (
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => void onUnpublish(post)}>
          Снять
        </Button>
      ) : post.status !== 'archived' ? (
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => void onPublish(post)}>
          Опубликовать
        </Button>
      ) : null}
      <Button
        type="button"
        variant={confirmArchiveId === post.id ? 'destructive' : 'ghost'}
        size="sm"
        disabled={disabled}
        onClick={() => void onArchive(post)}
      >
        {post.status === 'archived'
          ? 'Вернуть'
          : confirmArchiveId === post.id ? 'Подтвердить архив' : 'В архив'}
      </Button>
    </div>
  )
}

function BlogPostMobileCard({
  post,
  confirmArchiveId,
  disabled,
  onEdit,
  onPublish,
  onUnpublish,
  onArchive,
}: {
  post: BlogPostRecord
  confirmArchiveId: string | null
  disabled: boolean
  onEdit: (post: BlogPostRecord) => void
  onPublish: (post: BlogPostRecord) => void | Promise<void>
  onUnpublish: (post: BlogPostRecord) => void | Promise<void>
  onArchive: (post: BlogPostRecord) => void | Promise<void>
}) {
  return (
    <article className={cn('admin-mobile-card', post.status === 'archived' && 'is-muted')}>
      <div className="admin-mobile-card-head">
        <BlogPostTitle post={post} />
        <BlogPostStatusPill status={post.status} />
      </div>
      <div className="admin-property-grid">
        <BlogPostMobileFact label="Рубрика" value={post.category ?? 'Без рубрики'} />
        <BlogPostMobileFact label="Теги" value={post.tags.join(', ') || 'Не указаны'} />
        <BlogPostMobileFact label="Дата" value={post.publishedAt ? formatDateTime(post.publishedAt) : 'Не опубликована'} />
        <BlogPostMobileFact label="Порядок" value={String(post.sortOrder)} />
      </div>
      <div className="admin-mobile-card-actions split">
        <BlogPostActions
          post={post}
          confirmArchiveId={confirmArchiveId}
          disabled={disabled}
          onEdit={onEdit}
          onPublish={onPublish}
          onUnpublish={onUnpublish}
          onArchive={onArchive}
        />
      </div>
    </article>
  )
}

function BlogPostMobileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-detail-item">
      <Typography variant="caption" tone="muted">{label}</Typography>
      <Typography variant="bodySmMedium">{value}</Typography>
    </div>
  )
}

function BlogPreview({ state }: { state: BlogPostFormState }) {
  const contentHtml = renderBlogContentHtml(state.content)

  return (
    <article className="admin-blog-preview">
      <div className="admin-blog-preview-head">
        <Typography variant="caption" tone="muted">
          {state.category.trim() || 'Без рубрики'} · {blogStatusLabels[state.status]}
        </Typography>
        <Typography variant="h5">{state.title.trim() || 'Название статьи'}</Typography>
        <Typography variant="bodySm" tone="muted">{state.excerpt.trim() || 'Анонс статьи появится здесь.'}</Typography>
      </div>
      <div className="admin-blog-preview-body">
        {contentHtml ? (
          <div className="admin-rich-content" dangerouslySetInnerHTML={{ __html: contentHtml }} />
        ) : (
          <Typography variant="bodySm" tone="muted">Текст статьи появится в предпросмотре после ввода.</Typography>
        )}
      </div>
    </article>
  )
}

function defaultFormState(sortOrder: number): BlogPostFormState {
  return {
    slug: '',
    title: '',
    excerpt: '',
    content: '',
    coverImageUrl: '',
    category: '',
    tags: '',
    seoTitle: '',
    seoDescription: '',
    status: 'draft',
    publishedAt: '',
    publishedAtOriginalIso: null,
    sortOrder: String(sortOrder),
  }
}

function formStateFromPost(post: BlogPostRecord): BlogPostFormState {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: renderBlogContentHtml(post.content),
    coverImageUrl: post.coverImageUrl ?? '',
    category: post.category ?? '',
    tags: post.tags.join(', '),
    seoTitle: post.seoTitle ?? '',
    seoDescription: post.seoDescription ?? '',
    status: post.status,
    publishedAt: isoToDateTimeLocalInputValue(post.publishedAt),
    publishedAtOriginalIso: post.publishedAt,
    sortOrder: String(post.sortOrder),
  }
}

function buildPayload(state: BlogPostFormState): { value: BlogPostCreateRequest } | { error: string } {
  const sortOrder = Number(state.sortOrder)
  if (!Number.isInteger(sortOrder) || sortOrder < -1_000_000 || sortOrder > 1_000_000) {
    return { error: 'Порядок должен быть целым числом от -1000000 до 1000000.' }
  }

  const contentPlainText = blogContentPlainText(state.content)

  if (state.status === 'published') {
    const missingFields = [
      [state.title, 'название'],
      [state.excerpt, 'анонс'],
      [contentPlainText, 'текст статьи'],
    ].filter(([value]) => !String(value).trim())

    if (missingFields.length > 0) {
      return {
        error: `Для публикации заполните: ${missingFields.map(([, label]) => label).join(', ')}.`,
      }
    }
  }

  const publishedAt = dateTimeLocalInputToIso(state.publishedAt, state.publishedAtOriginalIso)
  if ('error' in publishedAt) return publishedAt

  if (state.status === 'published' && publishedAt.value && new Date(publishedAt.value).getTime() > Date.now()) {
    return { error: 'Дата публикации не должна быть в будущем.' }
  }

  return {
    value: {
      slug: state.slug.trim() || undefined,
      title: state.title,
      excerpt: state.excerpt,
      content: state.content.trim(),
      coverImageUrl: emptyToNull(state.coverImageUrl),
      category: emptyToNull(state.category),
      tags: parseList(state.tags),
      seoTitle: emptyToNull(state.seoTitle),
      seoDescription: emptyToNull(state.seoDescription),
      status: state.status,
      publishedAt: publishedAt.value,
      sortOrder,
    },
  }
}

function parseList(value: string) {
  return [...new Set(value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean))]
}

function canPublishBlogPost(post: BlogPostRecord) {
  return Boolean(post.title.trim() && post.excerpt.trim() && blogContentPlainText(post.content))
}

function sortBlogPosts(posts: BlogPostRecord[]) {
  return [...posts].sort((first, second) => {
    if (first.status !== second.status) return statusSortOrder(first.status) - statusSortOrder(second.status)
    const firstTime = first.publishedAt ?? first.updatedAt
    const secondTime = second.publishedAt ?? second.updatedAt
    return secondTime.localeCompare(firstTime)
  })
}

function statusSortOrder(status: BlogPostStatus) {
  if (status === 'published') return 0
  if (status === 'draft') return 1
  return 2
}

function nextBlogPostSortOrder(posts: BlogPostRecord[]) {
  const maxSortOrder = posts.reduce((max, post) => Math.max(max, post.sortOrder), 0)
  return maxSortOrder + 10
}

function emptyToNull(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function blogStatus(value: string): BlogPostStatus {
  if (blogStatusOptions.some((status) => status === value)) {
    return value as BlogPostStatus
  }

  return 'draft'
}

function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error) return error.message
  return 'Неизвестная ошибка'
}

const blogStatusOptions = ['draft', 'published', 'archived'] as const satisfies readonly BlogPostStatus[]
