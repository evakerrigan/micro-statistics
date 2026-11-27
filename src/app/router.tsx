import { createHashRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/app-layout';
import { AdobeRoute } from './routes/adobe';
import { AllRoute } from './routes/all';
import { IstockRoute } from './routes/istock';
import { NotFoundRoute } from './routes/not-found';
import { ShutterstockRoute } from './routes/shutterstock';

// Hash routing: the extension page is served as a file
// (chrome-extension://<id>/index.html), so there is no server-side fallback.
export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/adobe" replace />,
      },
      {
        path: 'adobe',
        element: <AdobeRoute />,
      },
      {
        path: 'shutterstock',
        element: <ShutterstockRoute />,
      },
      {
        path: 'istock',
        element: <IstockRoute />,
      },
      {
        path: 'all',
        element: <AllRoute />,
      },
      {
        path: '*',
        element: <NotFoundRoute />,
      },
    ],
  },
]);
