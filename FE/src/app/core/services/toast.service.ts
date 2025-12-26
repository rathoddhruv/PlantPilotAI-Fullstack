import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ToastMessage {
    message: string;
    type: 'success' | 'error' | 'info';
    duration?: number;
}

@Injectable({
    providedIn: 'root'
})
export class ToastService {
    private toastSubject = new BehaviorSubject<ToastMessage | null>(null);
    toast$ = this.toastSubject.asObservable();

    show(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) {
        this.toastSubject.next({ message, type, duration });
        if (duration > 0) {
            setTimeout(() => {
                this.clear();
            }, duration);
        }
    }

    clear() {
        this.toastSubject.next(null);
    }
}
