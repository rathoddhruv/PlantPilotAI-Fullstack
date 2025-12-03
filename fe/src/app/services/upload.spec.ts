import { TestBed } from '@angular/core/testing';

import { Upload } from './upload';

describe('Upload', () => {
  let service: Upload;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Upload);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
