# NGRX State Management Setup Guide

## Overview
This file documents how to install and configure NGRX for the PlantPilot application.

## Installation Steps

### 1. Install NGRX Packages
```bash
cd FE
npm install @ngrx/store @ngrx/effects @ngrx/store-devtools --save
```

### 2. Update app.config.ts
Add the following to your `app.config.ts` to configure the Store module:

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { environment } from '../environments/environment';

import { batchReducer } from './core/store/batch/batch.reducer';
import { trainingReducer } from './core/store/training/training.reducer';
import { BatchEffects } from './core/store/batch/batch.effects';
import { TrainingEffects } from './core/store/training/training.effects';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideStore({
      batch: batchReducer,
      training: trainingReducer
    }),
    provideEffects([BatchEffects, TrainingEffects]),
    provideStoreDevtools({
      maxAge: 25,
      logOnly: environment.production
    })
  ]
};
```

### 3. Create Effects Files

After installing NGRX, create:
- `core/store/batch/batch.effects.ts`
- `core/store/training/training.effects.ts`

These will handle API interactions for batch queue operations and training management.

## File Structure

```
src/app/core/store/
├── app.state.ts           # Global state interfaces
├── app.selectors.ts       # Selector functions for state
├── batch/
│   ├── batch.actions.ts   # Action creators
│   ├── batch.reducer.ts   # Reducer logic
│   └── batch.effects.ts   # Side effects (API calls)
└── training/
    ├── training.actions.ts
    ├── training.reducer.ts
    └── training.effects.ts
```

## Usage in Components

### Example: Subscribe to Batch Queue
```typescript
import { Store } from '@ngrx/store';
import { selectBatchQueue, selectBatchStatus } from './core/store/app.selectors';

export class YourComponent {
  queue$ = this.store.select(selectBatchQueue);
  status$ = this.store.select(selectBatchStatus);

  constructor(private store: Store) {}

  queueAnnotation(filename: string, detections: any[]) {
    this.store.dispatch(queueAnnotation({
      filename,
      detections,
      width: 960,
      height: 960,
      labelType: 'correct'
    }));
  }
}
```

### Example: Subscribe to Training Status
```typescript
export class TrainingComponent {
  isTraining$ = this.store.select(selectIsTraining);
  progress$ = this.store.select(selectTrainingProgress);
  logs$ = this.store.select(selectTrainingLogs);

  constructor(private store: Store) {}

  startTraining() {
    this.store.dispatch(startTraining({ epochs: 40 }));
  }
}
```

## Benefits of NGRX

1. **Predictable State Management**: Single source of truth for app state
2. **Time-Travel Debugging**: Redux DevTools integration for debugging
3. **Reactive Architecture**: Observable-based streams with RxJS
4. **Decoupled Components**: Components don't need direct service dependencies
5. **Testability**: Pure functions (reducers) are easy to test
6. **Scalability**: Better organization for large applications

## Next Steps

1. Install packages: `npm install @ngrx/store @ngrx/effects @ngrx/store-devtools`
2. Update `app.config.ts` with the Store provider
3. Create `batch.effects.ts` and `training.effects.ts`
4. Replace direct service calls with store dispatches
5. Use selectors in components instead of direct service subscriptions

## Redux DevTools Integration

Install Redux DevTools browser extension to inspect state changes in real-time:
- Chrome: [Redux DevTools Extension](https://chrome.google.com/webstore)
- Firefox: Similar extension available

Then open DevTools (F12) and navigate to the Redux tab to see:
- State tree
- Dispatched actions
- State changes
- Time-travel debugging
