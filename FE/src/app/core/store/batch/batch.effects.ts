import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { catchError, map, switchMap, withLatestFrom } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { selectBatchQueue } from '../app.selectors';
import * as BatchActions from './batch.actions';

@Injectable()
export class BatchEffects {
    queueAnnotation$ = createEffect(() =>
        this.actions$.pipe(
            ofType(BatchActions.queueAnnotation),
            map(action => BatchActions.getBatchStatus())
        )
    );

    rejectAnnotation$ = createEffect(() =>
        this.actions$.pipe(
            ofType(BatchActions.rejectAnnotation),
            switchMap(({ filename }) =>
                this.api.rejectBatchAnnotation(filename).pipe(
                    map(() => BatchActions.getBatchStatus()),
                    catchError(error =>
                        of(BatchActions.acceptBatchFailure({ error: error.message }))
                    )
                )
            )
        )
    );

    getBatchStatus$ = createEffect(() =>
        this.actions$.pipe(
            ofType(BatchActions.getBatchStatus),
            switchMap(() =>
                this.api.getBatchStatus().pipe(
                    map(res =>
                        BatchActions.getBatchStatusSuccess({
                            items: res.items,
                            queueSize: res.queue_size,
                            maxBatchSize: res.max_batch_size
                        })
                    ),
                    catchError(error =>
                        of(BatchActions.acceptBatchFailure({ error: error.message }))
                    )
                )
            )
        )
    );

    acceptBatch$ = createEffect(() =>
        this.actions$.pipe(
            ofType(BatchActions.acceptBatch),
            withLatestFrom(this.store.select(selectBatchQueue)),
            switchMap(([{ epochs, imgsz, model }, queue]) => {
                if (queue.length === 0) {
                    return of(BatchActions.acceptBatchFailure({ error: 'Batch queue is empty' }));
                }

                return this.api.acceptBatch(epochs || 40, imgsz || 960, model || 'yolov8n.pt').pipe(
                    map(res =>
                        BatchActions.acceptBatchSuccess({
                            message: res.message,
                            saved: res.saved
                        })
                    ),
                    catchError(error =>
                        of(BatchActions.acceptBatchFailure({ error: error.message }))
                    )
                );
            })
        )
    );

    constructor(
        private actions$: Actions,
        private api: ApiService,
        private store: Store
    ) {}
}
