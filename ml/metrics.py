import numpy as np


def calibration_metrics(probabilities, targets, bins=5):
    p=np.asarray(probabilities,dtype=np.float64);y=np.asarray(targets,dtype=np.int64)
    if p.ndim!=2 or len(p)!=len(y) or not len(y) or not np.isfinite(p).all() or np.any(p<0) or not np.allclose(p.sum(1),1):
        raise ValueError('Expected finite class probabilities and aligned targets.')
    confidence=p.max(1);correct=p.argmax(1)==y;bucket=np.minimum((confidence*bins).astype(int),bins-1)
    ece=0.;details=[]
    for i in range(bins):
        selected=bucket==i;n=int(selected.sum())
        accuracy=float(correct[selected].mean()) if n else None;mean=float(confidence[selected].mean()) if n else None
        if n:ece+=n/len(y)*abs(accuracy-mean)
        details.append(dict(bin=i,count=n,accuracy=accuracy,mean_confidence=mean))
    onehot=np.eye(p.shape[1])[y]
    return dict(nll=float(-np.log(np.maximum(p[np.arange(len(y)),y],1e-15)).mean()),
        multiclass_brier=float(np.square(p-onehot).sum(1).mean()),ece=float(ece),bins=details)


def classification_metrics(targets, predictions, labels):
    matrix = np.zeros((len(labels), len(labels)), dtype=np.int64)
    for truth, predicted in zip(targets, predictions, strict=True):
        matrix[int(truth), int(predicted)] += 1
    tp = matrix.diagonal()
    precision = np.divide(tp, matrix.sum(0), out=np.zeros(len(labels)), where=matrix.sum(0)>0)
    recall = np.divide(tp, matrix.sum(1), out=np.zeros(len(labels)), where=matrix.sum(1)>0)
    f1 = np.divide(2*precision*recall, precision+recall, out=np.zeros(len(labels)), where=precision+recall>0)
    return {'samples': int(matrix.sum()), 'top1': float(tp.sum()/max(1, matrix.sum())),
        'macro_precision': float(precision.mean()), 'macro_recall': float(recall.mean()), 'macro_f1': float(f1.mean()),
        'per_class': {label: {'precision': float(precision[i]), 'recall': float(recall[i]), 'f1': float(f1[i]), 'support': int(matrix[i].sum())} for i,label in enumerate(labels)},
        'confusion_matrix': matrix.tolist(), 'label_order': labels}
