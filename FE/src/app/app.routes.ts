import { Routes } from '@angular/router';
import { UploadComponent } from './features/upload/upload.component';
import { ReviewComponent } from './features/review/review.component';

export const routes: Routes = [
    { path: '', component: UploadComponent },
    { path: 'review', component: ReviewComponent },
    { path: '**', redirectTo: '' }
];
