import type { FC } from 'react'
import type UserDto from '@/interfaces/UserDto'
import { useEffect, useState } from 'react'
import { Table, Modal, Button } from 'react-bootstrap'
import { get, generateApiParameters } from '@/common/api'

type ModalProps = {
  show: boolean
  onHide: () => void
  user?: UserDto
}

const ModalComponent: FC<ModalProps> = ({ show, onHide, user }) => {
  return (
    <Modal
      show={show}
      onHide={onHide}
      size="lg"
      aria-labelledby="contained-modal-title-vcenter"
      centered
    >
      <Modal.Header closeButton>
        <Modal.Title id="contained-modal-title-vcenter">Row Details</Modal.Title>
      </Modal.Header>
      <Modal.Body>{JSON.stringify(user)}</Modal.Body>
      <Modal.Footer>
        <Button onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}

const Dashboard: FC = () => {
  const [data, setData] = useState<any>([])
  const [selectedUser, setSelectedUser] = useState<UserDto | undefined>(undefined)

  useEffect(() => {
    get<UserDto[]>(generateApiParameters('/api/v1/users'))
      .then((users) => {
        setData(users)
      })
      .catch((error) => {
        console.error(error)
      })
  }, [])

  const handleClose = () => {
    setSelectedUser(undefined)
  }

  return (
    <div className="min-vh-45 mh-45 mw-50 ml-4">
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>Employee ID</th>
            <th>Employee Name</th>
            <th>Employee Email</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.map((user: UserDto) => (
            <tr key={user.id}>
              <td>{user.id}</td>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td className="text-center">
                <Button variant="secondary" size="sm" onClick={() => setSelectedUser(user)}>
                  View Details
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <ModalComponent show={!!selectedUser} onHide={handleClose} user={selectedUser} />
    </div>
  )
}

export default Dashboard
