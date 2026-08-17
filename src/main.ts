import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { reportBootstrapFailure } from './app/core/operational-telemetry';

bootstrapApplication(App, appConfig).catch(reportBootstrapFailure);
