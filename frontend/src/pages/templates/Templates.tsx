import { useEffect } from 'react'
import type { FC } from 'react'
import { Link } from '@tanstack/react-router'
import type { TemplateResponse } from '@/api/templates.api'
import { useAppSelector, useAppDispatch } from '@/redux/hooks'
import { setPage } from '@/redux/slices/templates.slice'
import { fetchTemplates } from '@/redux/thunks/templates.thunks'
import PageHeading from '@/components/PageHeading'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'

const columns: TableColumn<TemplateResponse>[] = [
  {
    key: 'name',
    label: 'Name',
    render: (_, row) => (
      <Link
        to={`/template-edit/$templateId`}
        params={{ templateId: row.id }}
        style={{ color: 'black' }}
      >
        {row.name}
      </Link>
    ),
  },
  {
    key: 'channelCode',
    label: 'Channel',
    render: (_, row) => {
      const channelCode =
        row.channelCode.charAt(0).toUpperCase() + row.channelCode.slice(1).toLowerCase()
      return <span>{channelCode}</span>
    },
  },
  {
    key: 'active',
    label: 'Status',
    render: (_, row) => <span>{row.active ? 'Active' : 'Inactive'}</span>,
  },
  {
    key: 'updatedAt',
    label: 'Updated At',
    render: (_, row) => {
      const formatted = new Date(row.updatedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      return <span>{formatted}</span>
    },
  },
]

const Templates: FC = () => {
  const dispatch = useAppDispatch()
  const {
    items: templates,
    page,
    limit,
    count,
    isLoading,
  } = useAppSelector((state) => state.templates)
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)

  useEffect(() => {
    if (selectedTenant) {
      dispatch(fetchTemplates())
    }
  }, [page, selectedTenant, dispatch])

  return (
    <div className="container-fluid">
      <div className="row mb-4">
        <div className="col">
          <PageHeading title="Notification Templates" />
          <p className="text-muted">
            Manage email, SMS, and push notification templates for your tenants
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={templates}
        keyExtractor={(row) => row.id}
        emptyMessage="No templates found"
        currentPage={page}
        pageSize={limit}
        totalCount={count}
        isLoading={isLoading}
        onPageChange={(nextPage) => dispatch(setPage(nextPage))}
        label="Notification Templates"
      />
    </div>
  )
}

export default Templates
