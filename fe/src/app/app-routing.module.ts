import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Layout } from './core/layout/layout';
import { Upload } from './features/upload/upload';
import { Predictions } from './features/predictions/predictions';
import { Review } from './features/review/review';
import { Classes } from './features/classes/classes';

const routes: Routes = [
  { path: '', component: Layout },
  { path: 'upload', component: Upload },
  { path: 'predictions', component: Predictions },
  { path: 'review', component: Review },
  { path: 'classes', component: Classes }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
