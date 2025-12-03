import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Predictions } from './predictions';

describe('Predictions', () => {
  let component: Predictions;
  let fixture: ComponentFixture<Predictions>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Predictions]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Predictions);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
