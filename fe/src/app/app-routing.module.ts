import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LayoutComponent } from './core/layout/layout.component';
import { UploadComponent } from './features/upload/upload.component';
import { PredictionsComponent } from './features/predictions/predictions.component';
import { ReviewComponent } from './features/review/review.component';
import { ClassesComponent } from './features/classes/classes.component';

const routes: Routes = [
  { path: '', component: LayoutComponent },
  { path: 'upload', component: UploadComponent },
  { path: 'predictions', component: PredictionsComponent },
  { path: 'review', component: ReviewComponent },
  { path: 'classes', component: ClassesComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
