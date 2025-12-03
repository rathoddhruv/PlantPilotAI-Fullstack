# Frontend Technical Plan

## Overview
This document provides a technical plan for setting up the Angular frontend of the PlantPilotAI-Fullstack project. The goal is to create a user-friendly interface that allows users to upload images, view predictions, correct labels, and manage classes.

## Project Setup
1. **Set Up Angular Project**:
   ```bash
   ng new fe --routing --style=scss
   cd fe
   ```

2. **Install Dependencies**:
   - Install Angular Material for UI components.
   ```bash
   ng add @angular/material
   ```

## Components

### Image Upload Component
- **Purpose**: Allow users to upload images via drag-and-drop or file selection.
- **Template**:
  ```html
  <div class="upload-container">
    <mat-card>
      <mat-card-header>
        <mat-card-title>Upload Images</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <div (dragover)="onDragOver($event)" (drop)="onDrop($event)">
          Drag and drop images here or
          <input type="file" (change)="onFileSelected($event)">
        </div>
      </mat-card-content>
    </mat-card>
  </div>
  ```

### Prediction Display Component
- **Purpose**: Show prediction results with bounding boxes around detected objects.
- **Template**:
  ```html
  <div class="predictions-container">
    <mat-card>
      <mat-card-header>
        <mat-card-title>Predictions</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <img [src]="imageSrc" alt="Uploaded Image">
        <div *ngFor="let prediction of predictions">
          <span>{{ prediction.label }}</span>
          <span>{{ prediction.confidence }}</span>
        </div>
      </mat-card-content>
    </mat-card>
  </div>
  ```

### Label Correction Component
- **Purpose**: Enable users to correct labels and add new classes.
- **Template**:
  ```html
  <div class="label-correction-container">
    <mat-card>
      <mat-card-header>
        <mat-card-title>Label Corrections</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <mat-form-field appearance="fill">
          <mat-label>Select Correct Label</mat-label>
          <mat-select [(value)="selectedLabel">
            <mat-option *ngFor="let label of labels" [value]="label">{{ label }}</mat-option>
          </mat-select>
        </mat-form-field>
        <button mat-raised-button color="primary">Save Corrections</button>
      </mat-card-content>
    </mat-card>
  </div>
  ```

### Class Management Component
- **Purpose**: Manage list of available classes for labeling.
- **Template**:
  ```html
  <div class="class-management-container">
    <mat-card>
      <mat-card-header>
        <mat-card-title>Class Management</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <ul>
          <li *ngFor="let label of labels">{{ label }}</li>
        </ul>
        <mat-form-field appearance="fill">
          <mat-label>Add New Class</mat-label>
          <input matInput [(value)="newLabel">
        </mat-form-field>
        <button mat-raised-button color="primary">Add Class</button>
      </mat-card-content>
    </mat-card>
  </div>
  ```

## Services

### Upload Service
- **Purpose**: Handle file uploads to the backend API.
- **Service**:
  ```typescript
  import { Injectable } from '@angular/core';
  import { HttpClient } from '@angular/common/http';
  import { Observable } from 'rxjs';

  @Injectable({
    providedIn: 'root'
  })
  export class UploadService {
    private apiUrl = '/api/upload';

    constructor(private http: HttpClient) {}

    uploadFile(file: File): Observable<any> {
      const formData = new FormData();
      formData.append('file', file);
      return this.http.post(this.apiUrl, formData);
    }
  }
  ```

### Prediction Service
- **Purpose**: Fetch prediction results from the backend API.
- **Service**:
  ```typescript
  import { Injectable } from '@angular/core';
  import { HttpClient } from '@angular/common/http';
  import { Observable } from 'rxjs';

  @Injectable({
    providedIn: 'root'
  })
  export class PredictionService {
    private apiUrl = '/api/predict';

    constructor(private http: HttpClient) {}

    getPredictions(): Observable<any> {
      return this.http.get(this.apiUrl);
    }
  }
  ```

### Label Correction Service
- **Purpose**: Send corrected labels back to the backend API.
- **Service**:
  ```typescript
  import { Injectable } from '@angular/core';
  import { HttpClient } from '@angular/common/http';
  import { Observable } from 'rxjs';

  @Injectable({
    providedIn: 'root'
  })
  export class LabelCorrectionService {
    private apiUrl = '/api/manual_review';

    constructor(private http: HttpClient) {}

    sendCorrections(labels: any): Observable<any> {
      return this.http.post(this.apiUrl, labels);
    }
  }
  ```

## Routing

Set up routes for different views:
- **Home**: Default view.
- **Upload**: View for uploading images.
- **Predictions**: View for displaying predictions.
- **Classes**: View for managing classes.

**AppRoutingModule**:
```typescript
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { UploadComponent } from './upload/upload.component';
import { PredictionsComponent } from './predictions/predictions.component';
import { ClassesComponent } from './classes/classes.component';

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'upload', component: UploadComponent },
  { path: 'predictions', component: PredictionsComponent },
  { path: 'classes', component: ClassesComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
```

## Summary
This technical plan outlines the setup, components, services, and routing for the Angular frontend of the PlantPilotAI-Fullstack project. By following these instructions, you can build a user-friendly interface that interacts seamlessly with the backend API.
