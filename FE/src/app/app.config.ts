import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { BatchEffects } from './core/store/batch/batch.effects';
import { batchReducer } from './core/store/batch/batch.reducer';
import { TrainingEffects } from './core/store/training/training.effects';
import { trainingReducer } from './core/store/training/training.reducer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    provideStore({
      batch: batchReducer,
      training: trainingReducer
    }),
    provideEffects([BatchEffects, TrainingEffects]),
    provideStoreDevtools({
      maxAge: 25,
      logOnly: true // Change to false in production for time-travel debugging
    })
  ]
};
