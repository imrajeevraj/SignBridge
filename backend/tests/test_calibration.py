import pytest
from ml.metrics import calibration_metrics


def test_calibration_known_probabilities_and_empty_bins():
    result=calibration_metrics([[1.,0.],[0.,1.]],[0,1])
    assert result['nll']==0 and result['multiclass_brier']==0 and result['ece']==0
    assert sum(row['count'] for row in result['bins'])==2
    wrong=calibration_metrics([[.9,.1]],[1])
    assert wrong['ece']==pytest.approx(.9) and wrong['multiclass_brier']==pytest.approx(1.62)
    with pytest.raises(ValueError):calibration_metrics([[.9,.9]],[0])
