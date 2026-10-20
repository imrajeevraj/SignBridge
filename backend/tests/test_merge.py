import json
import pytest
from ml.merge_extractions import merge
from ml.dataset import load_dataset
from test_inference import fixture_dataset


def test_merge_preserves_audited_windows_and_rejects_duplicate_ids(tmp_path):
    source=tmp_path/'source';source.mkdir();manifest=fixture_dataset(source)
    output=tmp_path/'merged';merge(manifest,[manifest],output)
    _,clips,_=load_dataset(output/'manifest.json',allow_test_fixture=True)
    assert len(clips)==6
    with pytest.raises(ValueError,match='Duplicate'):merge(manifest,[manifest,manifest],tmp_path/'bad')
    assert not (tmp_path/'bad').exists()


def test_merge_rejects_changed_split_before_writing(tmp_path):
    source=tmp_path/'source';source.mkdir();manifest=fixture_dataset(source)
    catalog=json.loads(manifest.read_text());catalog['samples'][0]['split']='test'
    path=tmp_path/'catalog.json';path.write_text(json.dumps(catalog))
    with pytest.raises(ValueError,match='provenance drift'):merge(path,[manifest],tmp_path/'bad')
