import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, ToastMessage } from '../../../core/services/toast.service';
import { Observable } from 'rxjs';

@Component({
    selector: 'app-toast',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div *ngIf="toast$ | async as toast" 
         class="fixed bottom-5 right-5 z-50 px-6 py-3 rounded shadow-lg text-white transition-opacity duration-300"
         [ngClass]="{
           'bg-green-600': toast.type === 'success',
           'bg-red-600': toast.type === 'error',
           'bg-blue-600': toast.type === 'info'
         }">
      {{ toast.message }}
    </div>
  `,
    styles: []
})
export class ToastComponent {
    toast$: Observable<ToastMessage | null>;

    constructor(private toastService: ToastService) {
        this.toast$ = this.toastService.toast$;
    }
}
