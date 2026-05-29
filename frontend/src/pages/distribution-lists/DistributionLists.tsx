import type { FC } from 'react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import PageHeading from '@/components/PageHeading'
import { DataTable } from '@/components/DataTable'
import type { TableColumn } from '@/components/DataTable'

export interface DistributionList {
  id: string
  name: string
  description: string
  memberCount: number
  status: 'active' | 'inactive'
  createdBy: string
  createdAt: string
}

// Mock data for distribution lists
const mockDistributionLists: DistributionList[] = [
  {
    id: '1',
    name: 'QSOS Participants',
    description: 'All participants in the Graduates Outcome Survey',
    memberCount: 2450,
    status: 'active',
    createdBy: 'admin@example.com',
    createdAt: '2025-01-15T10:30:00Z',
  },
  {
    id: '2',
    name: 'Employer Partners',
    description: 'Registered employer organizations for followup surveys',
    memberCount: 342,
    status: 'active',
    createdBy: 'admin@example.com',
    createdAt: '2025-01-10T14:22:00Z',
  },
  {
    id: '3',
    name: 'Graduate Cohort 2024',
    description: 'All graduates from the 2024 academic year',
    memberCount: 1850,
    status: 'active',
    createdBy: 'user@example.com',
    createdAt: '2024-12-20T09:15:00Z',
  },
  {
    id: '4',
    name: 'Internal Communications Team',
    description: 'Team members receiving internal alert notifications',
    memberCount: 12,
    status: 'active',
    createdBy: 'admin@example.com',
    createdAt: '2024-11-05T11:45:00Z',
  },
  {
    id: '5',
    name: 'Legacy Distribution List',
    description: 'Archived list no longer in use',
    memberCount: 0,
    status: 'inactive',
    createdBy: 'admin@example.com',
    createdAt: '2024-06-01T08:00:00Z',
  },
]

const columns: TableColumn<DistributionList>[] = [
  {
    key: 'name',
    label: 'Name',
    render: (_, row) => <span className="fw-bold">{row.name}</span>,
  },
  {
    key: 'description',
    label: 'Description',
    render: (_, row) => (
      <span className="text-muted text-truncate" title={row.description}>
        {row.description}
      </span>
    ),
  },
  {
    key: 'memberCount',
    label: 'Members',
    render: (_, row) => <span className="badge bg-secondary">{row.memberCount}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    render: (_, row) => (
      <span className={`badge ${row.status === 'active' ? 'bg-success' : 'bg-danger'}`}>
        {row.status === 'active' ? 'Active' : 'Inactive'}
      </span>
    ),
  },
  {
    key: 'createdBy',
    label: 'Created By',
    render: (_, row) => (
      <span title={row.createdBy} className="text-truncate">
        {row.createdBy}
      </span>
    ),
  },
  {
    key: 'createdAt',
    label: 'Created',
    render: (_, row) => (
      <span title={new Date(row.createdAt).toLocaleString()}>
        {new Date(row.createdAt).toLocaleDateString()}
      </span>
    ),
  },
  {
    key: 'id',
    label: 'Actions',
    render: (_, row) => (
      <Link to="/" className="btn btn-sm btn-outline-primary" title="Edit distribution list">
        Edit
      </Link>
    ),
  },
]

const DistributionLists: FC = () => {
  const [distributionLists] = useState<DistributionList[]>(mockDistributionLists)
  const [page, setPage] = useState(1)
  const limit = 10

  return (
    <div>
      <PageHeading title="Distribution Lists" />

      <DataTable
        columns={columns}
        data={distributionLists}
        keyExtractor={(row) => row.id}
        label="Distribution Lists"
        emptyMessage="No distribution lists found"
        currentPage={page}
        pageSize={limit}
        totalCount={distributionLists.length}
        onPageChange={setPage}
      />
    </div>
  )
}

export default DistributionLists
