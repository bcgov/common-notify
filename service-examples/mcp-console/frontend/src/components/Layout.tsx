import type { FC, ReactNode } from 'react';
import { Footer, Header } from '@bcgov/design-system-react-components';
import { Link } from '@tanstack/react-router';

const Layout: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="layout-container">
    <Header title="MCP Console">
      <div className="d-flex gap-3">
        <Link to="/" className="text-primary fw-semibold text-decoration-none">
          Global admin
        </Link>
        <Link to="/tenant" className="text-primary fw-semibold text-decoration-none">
          Tenant admin
        </Link>
      </div>
    </Header>
    <div className="layout-body">
      <div className="layout-content">{children}</div>
    </div>
    <Footer />
  </div>
);

export default Layout;
