import { TestBed } from '@angular/core/testing';

import { Classes } from './classes';

describe('Classes', () => {
  let service: Classes;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Classes);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
