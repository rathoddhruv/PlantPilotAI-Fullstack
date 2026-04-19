import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { interval, of } from 'rxjs';
import { catchError, map, startWith, switchMap, takeUntil, tap } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import * as TrainingActions from './training.actions';

@Injectable()
export class TrainingEffects {
    startTraining$ = createEffect(() =>
        this.actions$.pipe(
            ofType(TrainingActions.startTraining),
            switchMap(({ epochs, imgsz, model }) =>
                this.api.acceptBatch(epochs || 40, imgsz || 960, model || 'yolov8n.pt').pipe(
                    map(() => TrainingActions.startTrainingSuccess()),
                    tap(() => {
                        // Start polling logs after training starts
                        this.store.dispatch(TrainingActions.pollTrainingLogs());
                    }),
                    catchError(error =>
                        of(TrainingActions.startTrainingFailure({ error: error.message }))
                    )
                )
            )
        )
    );

    pollTrainingLogs$ = createEffect(() =>
        this.actions$.pipe(
            ofType(TrainingActions.pollTrainingLogs),
            switchMap(() =>
                interval(2000).pipe(
                    startWith(0),
                    switchMap(() =>
                        this.api.getLogs().pipe(
                            map(res => {
                                const isComplete = res.logs.some((log: string) =>
                                    log.toLowerCase().includes('reloading model') ||
                                    log.toLowerCase().includes('training complete') ||
                                    log.toLowerCase().includes('training failed')
                                );

                                // Simple progress estimation
                                const epochMatch = res.logs
                                    .map((log: string) => log.match(/(\d+)\/(\d+)\s+epoch/i))
                                    .find(m => m !== null);

                                const progress = epochMatch
                                    ? (parseInt(epochMatch[1]) / parseInt(epochMatch[2])) * 100
                                    : 0;

                                return TrainingActions.pollTrainingLogsSuccess({
                                    logs: res.logs,
                                    progress: Math.min(progress, 100),
                                    isComplete
                                });
                            }),
                            catchError(error =>
                                of(TrainingActions.pollTrainingLogsFailure({ error: error.message }))
                            )
                        )
                    ),
                    takeUntil(
                        this.actions$.pipe(
                            ofType(TrainingActions.stopTrainingPolling)
                        )
                    )
                )
            )
        )
    );

    pollTrainingRunsOnCompletion$ = createEffect(() =>
        this.actions$.pipe(
            ofType(TrainingActions.pollTrainingLogsSuccess),
            switchMap(({ isComplete }) => {
                if (isComplete) {
                    return of(TrainingActions.getTrainingRuns(), TrainingActions.stopTrainingPolling());
                }
                return of();
            })
        )
    );

    getTrainingRuns$ = createEffect(() =>
        this.actions$.pipe(
            ofType(TrainingActions.getTrainingRuns),
            switchMap(() =>
                this.api.getRuns().pipe(
                    map(res =>
                        TrainingActions.getTrainingRunsSuccess({
                            runs: res.runs
                        })
                    ),
                    catchError(error =>
                        of(TrainingActions.getTrainingRunsFailure({ error: error.message }))
                    )
                )
            )
        )
    );

    constructor(
        private actions$: Actions,
        private api: ApiService,
        private store: Store
    ) {}
}
