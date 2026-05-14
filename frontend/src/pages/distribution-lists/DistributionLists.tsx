import type { FC } from 'react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import Card from '@/components/Card'
import PageHeading from '@/components/PageHeading'

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

const DistributionLists: FC = () => {
  const [distributionLists] = useState<DistributionList[]>(mockDistributionLists)
  const [page] = useState(1)
  const limit = 10

  return (
    <div>
      <PageHeading title="Distribution Lists" />

      <Card className="mb-4">
        {distributionLists.length === 0 ? (
          <div className="text-center py-4 text-muted">
            <p>No distribution lists found</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Members</th>
                  <th>Status</th>
                  <th>Created By</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {distributionLists.map((list) => (
                  <tr key={list.id}>
                    <td className="fw-bold">{list.name}</td>
                    <td className="text-muted text-truncate" title={list.description}>
                      {list.description}
                    </td>
                    <td>
                      <span className="badge bg-secondary">{list.memberCount}</span>
                    </td>
                    <td>
                      <span
                        className={`badge ${list.status === 'active' ? 'bg-success' : 'bg-danger'}`}
                      >
                        {list.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td title={list.createdBy} className="text-truncate">
                      {list.createdBy}
                    </td>
                    <td title={new Date(list.createdAt).toLocaleString()}>
                      {new Date(list.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <Link
                        to="/"
                        className="btn btn-sm btn-outline-primary"
                        title="Edit distribution list"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {distributionLists.length > 0 && (
        <nav aria-label="Distribution lists pagination" className="mt-4">
          <ul className="pagination justify-content-center">
            <li className={`page-item ${page === 1 ? 'disabled' : ''}`}>
              <button className="page-link" disabled={page === 1}>
                Previous
              </button>
            </li>
            <li className="page-item active">
              <span className="page-link">
                Page {page} of {Math.ceil(distributionLists.length / limit)}
              </span>
            </li>
            <li
              className={`page-item ${page * limit >= distributionLists.length ? 'disabled' : ''}`}
            >
              <button className="page-link" disabled={page * limit >= distributionLists.length}>
                Next
              </button>
            </li>
          </ul>
        </nav>
      )}
    </div>
  )
}

export default DistributionLists
