import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import {
  OperationalErrorHandler,
  OperationalRouterMonitor,
  OperationalTelemetryService,
} from './core/operational-telemetry';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: OperationalErrorHandler },
    provideAppInitializer(() => {
      inject(OperationalTelemetryService).initialize();
      inject(OperationalRouterMonitor).start();
    }),
    provideRouter(
      routes,
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'top',
      }),
    ),
    provideAnimationsAsync(),
  ],
};
