import { TestBed } from '@angular/core/testing';

import { Prediction } from './prediction';

describe('Prediction', () => {
  let service: Prediction;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Prediction);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
