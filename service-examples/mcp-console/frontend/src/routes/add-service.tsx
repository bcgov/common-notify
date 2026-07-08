import { createFileRoute } from '@tanstack/react-router';
import AddService from '@/pages/add-service/AddService';

export const Route = createFileRoute('/add-service')({
  component: AddService,
});
