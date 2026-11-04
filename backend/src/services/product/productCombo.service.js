const { transactional } = require('../../infrastructure/transaction');
const comboRepository = require('../../repositories/product/productCombo.repository');
const productRepository = require('../../repositories/product/product.repository');
const stockRepository = require('../../repositories/productStock.repository');

const changeAssemblyStock = async (productId, difference) => {
    const children = await comboRepository.getComboItems(productId);
    if (!children.length) throw new Error('Combo chưa có sản phẩm con.');
    for (const child of children) {
        const needed = child.quantity * difference;
        if (needed > 0) {
            const stock = await stockRepository.getStockByProductId(null, child.childProductId);
            const updated = await stockRepository.decreaseStockIfAvailable(null, child.childProductId, needed);
            if (!updated) throw new Error(`INSUFFICIENT_STOCK:${child.childProductId}:${child.childProductName}:${needed}:${stock?.quantityOnHand || 0}`);
        } else {
            await stockRepository.addStock(null, child.childProductId, -needed);
        }
    }
    await stockRepository.addStock(null, productId, difference);
    return true;
};

function translateDatabaseError(err) {
    const num = err.number || (err.code === 11000 ? 2627 : err.code);
    const msg = err.message || '';

    if (num === 2627 || num === 2601) {
        return new Error('Sản phẩm con này đã tồn tại trong combo.');
    }

    if (num === 547) {
        return new Error('Sản phẩm cha hoặc sản phẩm con không hợp lệ.');
    }

    if (/CK_ProductCombos_ParentChild/i.test(msg)) {
        return new Error('Sản phẩm combo không thể chứa chính nó.');
    }

    return err;
}

exports.getComboItems = async (productId) => {
    return comboRepository.getComboItems(productId);
};

exports.getComboCostPrice = async (productId) => {
    return comboRepository.getComboCostPrice(productId);
};

exports.addComboItem = async (productId, payload) => {
    const quantity = Number(payload.quantity || 1);
    if (Number.isNaN(quantity) || quantity <= 0) {
        throw new Error('Số lượng thành phần combo phải lớn hơn 0.');
    }

    const parentProduct = await productRepository.getProductById(productId);
    if (!parentProduct) {
        throw new Error('Không tìm thấy sản phẩm combo.');
    }

    if (!parentProduct.isCombo) {
        throw new Error('Sản phẩm cha không phải là combo.');
    }

    const childProduct = await productRepository.getProductById(payload.childProductId);
    if (!childProduct) {
        throw new Error('Không tìm thấy sản phẩm con.');
    }

    if (String(productId) === String(payload.childProductId)) {
        throw new Error('Combo không thể chứa chính nó.');
    }

    if (childProduct.isCombo) {
        throw new Error('Không nên cho combo lồng combo. Sản phẩm con phải là hàng tồn kho thực.');
    }

    try {
        return await comboRepository.addComboItem(productId, {
            childProductId: payload.childProductId,
            quantity
        });
    } catch (err) {
        throw translateDatabaseError(err);
    }
};

exports.removeComboItem = async (comboItemId, productId) => {
    const deleted = await comboRepository.removeComboItem(comboItemId, productId);
    if (!deleted) {
        throw new Error('Không tìm thấy thành phần combo.');
    }
    return true;
};

exports.assembleCombo = async (productId, quantity) => {
    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty <= 0) {
        throw new Error('Số lượng tạo combo phải lớn hơn 0.');
    }

    const parent = await productRepository.getProductById(productId);
    if (!parent) {
        throw new Error('Không tìm thấy sản phẩm combo.');
    }
    if (!parent.isCombo) {
        throw new Error('Sản phẩm này không phải là combo.');
    }

    try {
        return await changeAssemblyStock(productId, qty);
    } catch (err) {
        if (err.message?.startsWith('INSUFFICIENT_STOCK:')) {
            const match = err.message.match(/^INSUFFICIENT_STOCK:\d+:(.+):([\.\d]+):([\.\d]+)$/);
            if (match) {
                const [, childName, needed, available] = match;
                throw new Error(
                    `Không đủ tồn kho sản phẩm con "${childName}". Cần ${needed}, hiện có ${available}.`
                );
            }
        }
        throw err;
    }
};

exports.updateComboStock = async (productId, newQuantity) => {
    const qty = Number(newQuantity);
    if (Number.isNaN(qty) || qty < 0) {
        throw new Error('Số lượng tồn kho không được nhỏ hơn 0.');
    }

    const parent = await productRepository.getProductById(productId);
    if (!parent) throw new Error('Không tìm thấy sản phẩm combo.');
    if (!parent.isCombo) throw new Error('Sản phẩm này không phải là combo.');

    try {
        const stock = await stockRepository.getStockByProductId(null, productId);
        const difference = qty - (stock?.quantityOnHand || 0);
        return Math.abs(difference) < 0.001 ? true : await changeAssemblyStock(productId, difference);
    } catch (err) {
        if (err.message?.startsWith('INSUFFICIENT_STOCK:')) {
            const match = err.message.match(/^INSUFFICIENT_STOCK:\d+:(.+):([\.\d]+):([\.\d]+)$/);
            if (match) {
                const [, childName, needed, available] = match;
                throw new Error(
                    `Không đủ tồn kho sản phẩm con "${childName}". Cần ${needed}, hiện có ${available}.`
                );
            }
        }
        throw err;
    }
};

// This service defines the unit of work; repositories share its session.
for (const method of ["assembleCombo","updateComboStock"]) {
    if (typeof module.exports[method] !== 'function') throw new Error('Unknown transaction method: ' + method);
    module.exports[method] = transactional(module.exports[method]);
}
