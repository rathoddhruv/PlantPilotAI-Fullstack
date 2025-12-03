import { TestBed } from '@angular/core/testing';

import { Review } from './review';

describe('Review', () => {
  let service: Review;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Review);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
