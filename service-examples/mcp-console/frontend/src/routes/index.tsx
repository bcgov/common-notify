import { createFileRoute } from '@tanstack/react-router';
import ServiceList from '@/pages/service-list/ServiceList';

export const Route = createFileRoute('/')({
  component: ServiceList,
});
